# Роутер фичи messenger: простые 1-на-1 чаты. WS-доставка идёт через уже существующий /api/ws
# (src/features/notifications/router.py) — здесь только REST для создания/чтения/отправки/удаления.
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
    summary="Создать (или получить существующий) чат с человеком",
    description=(
        "person_id — узел графа, с которым хотите переписываться (должен быть привязан к реальному "
        "аккаунту). Идемпотентно: повторный вызов с тем же person_id вернёт тот же самый чат, а не "
        "создаст дубликат — можно смело вешать на кнопку «написать» на карточке человека."
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
    summary="Список своих чатов",
    description="Чаты текущего пользователя, новые сверху. Для каждого — peer_user_id (с кем чат) и последнее сообщение.",
)
async def list_chats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)) -> list[ChatRead]:
    chats = await messenger_service.list_chats_for_user(db, current_user.id)
    return [_to_chat_read(chat, current_user.id, last_message) for chat, last_message in chats]


@router.get(
    "/chats/{id}/messages",
    response_model=list[MessageRead],
    summary="История сообщений чата",
    description="Все сообщения чата по возрастанию времени. Доступно только участникам чата.",
)
async def list_messages(
    id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)
) -> list[MessageRead]:
    messages = await messenger_service.list_messages(db, id, current_user)
    return [MessageRead.model_validate(m) for m in messages]


@router.post(
    "/chats/{id}/messages",
    response_model=MessageRead,
    summary="Отправить сообщение",
    description=(
        "Сохраняет сообщение и мгновенно доставляет получателю по WebSocket (`{\"type\": \"message\", ...}`), "
        "если он онлайн, плюс создаёт уведомление (`new_message`) — оно попадёт и в историю уведомлений, "
        "и по тому же WS с `{\"type\": \"notification\", ...}`, независимо от того, открыт ли у получателя чат."
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
    summary="Удалить чат",
    description="Полностью удаляет чат и всю историю сообщений (каскадно) для обоих участников. Доступно любому из двоих.",
)
async def delete_chat(id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_user)) -> None:
    await messenger_service.delete_chat(db, id, current_user)
