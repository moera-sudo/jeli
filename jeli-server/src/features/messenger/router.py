# Router for the messenger feature: simple 1-on-1 chats. WS delivery goes through the already
# existing /api/ws (src/features/notifications/router.py) — this file only has REST endpoints
# for create/read/send/delete.
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.dependencies import get_user
from src.features.messenger import service as messenger_service
from src.features.messenger.models import Chat, Message
from src.features.messenger.schemas import ChatCreateRequest, ChatRead, MessageCreateRequest, MessageRead
from src.features.user.models import User

router = APIRouter(tags=["messenger"])


def _to_chat_read(chat: Chat, viewer_id: uuid.UUID, last_message: Message | None) -> ChatRead:
    return ChatRead(
        id=chat.id,
        peer_user_id=chat.user_b_id if chat.user_a_id == viewer_id else chat.user_a_id,
        created_at=chat.created_at,
        last_message=MessageRead.model_validate(last_message) if last_message else None,
    )


@router.post(
    "/chats",
    response_model=ChatRead,
    summary="Create (or get the existing) chat with a person",
    description=(
        "person_id — the graph node you want to chat with (must be linked to a real account). "
        "Idempotent: calling again with the same person_id returns the same chat rather than "
        "creating a duplicate — safe to wire up directly to the \"message\" button on a person's card."
    ),
)
async def create_chat(
    payload: ChatCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> ChatRead:
    chat = await messenger_service.get_or_create_chat(db, current_user, payload.person_id)
    last_message = await messenger_service.get_last_message(db, chat.id)
    return _to_chat_read(chat, current_user.id, last_message)


@router.get(
    "/chats",
    response_model=list[ChatRead],
    summary="List your own chats",
    description="The current user's chats, newest first. For each one — peer_user_id (who the chat is with) and the last message.",
)
async def list_chats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)) -> list[ChatRead]:
    chats = await messenger_service.list_chats_for_user(db, current_user.id)
    return [_to_chat_read(chat, current_user.id, last_message) for chat, last_message in chats]


@router.get(
    "/chats/{id}/messages",
    response_model=list[MessageRead],
    summary="Chat message history",
    description="All messages of the chat in ascending chronological order. Available only to chat participants.",
)
async def list_messages(
    id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)
) -> list[MessageRead]:
    messages = await messenger_service.list_messages(db, id, current_user)
    return [MessageRead.model_validate(m) for m in messages]


@router.post(
    "/chats/{id}/messages",
    response_model=MessageRead,
    summary="Send a message",
    description=(
        "Saves the message and instantly delivers it to the recipient over WebSocket "
        "(`{\"type\": \"message\", ...}`) if they're online, plus creates a notification (`new_message`) — "
        "it lands both in the notification history and over the same WS as `{\"type\": \"notification\", ...}`, "
        "regardless of whether the recipient has the chat open."
    ),
)
async def send_message(
    id: uuid.UUID,
    payload: MessageCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_user),
) -> MessageRead:
    message = await messenger_service.send_message(db, id, current_user, payload.content)
    return MessageRead.model_validate(message)


@router.delete(
    "/chats/{id}",
    status_code=204,
    summary="Delete a chat",
    description="Completely deletes the chat and its entire message history (cascading) for both participants. Available to either of the two.",
)
async def delete_chat(id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)) -> None:
    await messenger_service.delete_chat(db, id, current_user)
