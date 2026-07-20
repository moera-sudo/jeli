# Роутер фичи notifications: список/чтение уведомлений + единственная WS-точка входа приложения.
# WS-роут физически лежит здесь (не в отдельной фиче messenger), т.к. notifications — первая фича,
# которой он реально нужен; messenger в будущем переиспользует ТОТ ЖЕ /ws, добавив свой "type" в
# мультиплексируемый JSON-конверт, без создания второго соединения (см. src/ws_manager.py).
import logging
import uuid

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from src.config.database import get_db
from src.dependencies import get_user, get_user_ws
from src.features.notifications import service as notifications_service
from src.features.notifications.schemas import NotificationRead
from src.features.user.models import User
from src.ws_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["notifications"])


@router.get(
    "/notifications",
    response_model=list[NotificationRead],
    summary="Список уведомлений",
    description="Возвращает уведомления текущего пользователя, новые сверху. unread_only фильтрует только непрочитанные.",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Только непрочитанные"),
    db=Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[NotificationRead]:
    notifications = await notifications_service.list_notifications(db, current_user.id, unread_only)
    return [NotificationRead.model_validate(n) for n in notifications]


@router.post(
    "/notifications/{id}/read",
    response_model=NotificationRead,
    summary="Отметить уведомление прочитанным",
)
async def mark_read(id: uuid.UUID, db=Depends(get_db), current_user: User = Depends(get_user)) -> NotificationRead:
    notification = await notifications_service.mark_read(db, current_user.id, id)
    return NotificationRead.model_validate(notification)


@router.post(
    "/notifications/read-all",
    status_code=204,
    summary="Отметить все уведомления прочитанными",
)
async def mark_all_read(db=Depends(get_db), current_user: User = Depends(get_user)) -> None:
    await notifications_service.mark_all_read(db, current_user.id)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user: User | None = Depends(get_user_ws)) -> None:
    # * Единая точка входа WS для всего приложения (уведомления сейчас, мессенджер — позже, тот же сокет).
    # ! Закрываем ДО accept(), если авторизация не прошла — ASGI-сервер вернёт клиенту отказ хендшейка,
    # ! а не резкий разрыв уже установленного соединения.
    if user is None:
        await websocket.close(code=1008)
        return
    await manager.connect(user.id, websocket)
    try:
        async for _ in websocket.iter_text():
            pass  # * клиент ничего не обязан присылать — канал только для push от сервера
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user %s", user.id)
    finally:
        manager.disconnect(user.id)
