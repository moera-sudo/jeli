# Business logic for the messenger feature: simple 1-on-1 chats on top of ws_manager (Stage 4) and notifications.
import logging
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.graph import service as graph_service
from src.features.messenger.exceptions import (
    CannotChatWithSelfError,
    ChatNotFoundError,
    NotChatParticipantError,
    TargetNotLinkedError,
)
from src.features.messenger.models import Chat, Message
from src.features.notifications import service as notifications_service
from src.features.notifications.constants import NOTIFICATION_TYPE_NEW_MESSAGE
from src.features.user.models import User
from src.ws_manager import manager

logger = logging.getLogger(__name__)


def _canonical_order(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (a, b) if str(a) < str(b) else (b, a)


async def get_or_create_chat(db: AsyncSession, current_user: User, target_person_id: uuid.UUID) -> Chat:
    person = await graph_service.get_person_or_404(db, target_person_id)
    if person.linked_user_id is None:
        raise TargetNotLinkedError()
    if person.linked_user_id == current_user.id:
        raise CannotChatWithSelfError()

    user_a_id, user_b_id = _canonical_order(current_user.id, person.linked_user_id)
    result = await db.execute(select(Chat).where(Chat.user_a_id == user_a_id, Chat.user_b_id == user_b_id))
    chat = result.scalar_one_or_none()
    if chat is not None:
        return chat

    chat = Chat(user_a_id=user_a_id, user_b_id=user_b_id)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    logger.info("Chat created: %s (%s <-> %s)", chat.id, user_a_id, user_b_id)
    return chat


async def get_existing_chat_id(db: AsyncSession, user_a_id: uuid.UUID, user_b_id: uuid.UUID) -> uuid.UUID | None:
    # * Used to enrich PersonDetail.chat_thread_id from graph/router.py — read-only, creates nothing.
    canonical_a, canonical_b = _canonical_order(user_a_id, user_b_id)
    result = await db.execute(select(Chat.id).where(Chat.user_a_id == canonical_a, Chat.user_b_id == canonical_b))
    return result.scalar_one_or_none()


async def get_chat_or_404(db: AsyncSession, chat_id: uuid.UUID) -> Chat:
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if chat is None:
        raise ChatNotFoundError()
    return chat


def _ensure_participant(chat: Chat, user_id: uuid.UUID) -> None:
    if user_id not in (chat.user_a_id, chat.user_b_id):
        raise NotChatParticipantError()


def _peer_id(chat: Chat, viewer_id: uuid.UUID) -> uuid.UUID:
    return chat.user_b_id if chat.user_a_id == viewer_id else chat.user_a_id


async def get_last_message(db: AsyncSession, chat_id: uuid.UUID) -> Message | None:
    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def list_chats_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[Chat, Message | None]]:
    result = await db.execute(
        select(Chat).where(or_(Chat.user_a_id == user_id, Chat.user_b_id == user_id)).order_by(Chat.created_at.desc())
    )
    chats = list(result.scalars())
    return [(chat, await get_last_message(db, chat.id)) for chat in chats]


async def list_messages(db: AsyncSession, chat_id: uuid.UUID, current_user: User) -> list[Message]:
    chat = await get_chat_or_404(db, chat_id)
    _ensure_participant(chat, current_user.id)
    result = await db.execute(select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at.asc()))
    return list(result.scalars())


async def send_message(db: AsyncSession, chat_id: uuid.UUID, current_user: User, content: str) -> Message:
    chat = await get_chat_or_404(db, chat_id)
    _ensure_participant(chat, current_user.id)

    message = Message(chat_id=chat_id, sender_id=current_user.id, content=content)
    db.add(message)
    await db.commit()
    await db.refresh(message)

    peer_id = _peer_id(chat, current_user.id)
    await manager.send_to_user(
        peer_id,
        {
            "type": "message",
            "message": {
                "id": str(message.id),
                "chat_id": str(message.chat_id),
                "sender_id": str(message.sender_id),
                "content": message.content,
                "created_at": message.created_at.isoformat(),
            },
        },
    )
    await notifications_service.create_notification(
        db,
        peer_id,
        NOTIFICATION_TYPE_NEW_MESSAGE,
        {"chat_id": str(chat_id), "message_id": str(message.id), "sender_id": str(current_user.id)},
    )
    logger.info("Message sent: %s (chat=%s, sender=%s)", message.id, chat_id, current_user.id)
    return message


async def delete_chat(db: AsyncSession, chat_id: uuid.UUID, current_user: User) -> None:
    chat = await get_chat_or_404(db, chat_id)
    _ensure_participant(chat, current_user.id)
    await db.delete(chat)
    await db.commit()
    logger.info("Chat deleted: %s", chat_id)
