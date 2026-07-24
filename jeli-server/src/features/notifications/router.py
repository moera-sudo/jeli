# Router for the notifications feature: list/read notifications + the app's single WS entry point.
# The WS route physically lives here (not in a separate messenger feature) because notifications was
# the first feature that actually needed it; messenger later reuses the SAME /ws, adding its own "type"
# into the multiplexed JSON envelope, without opening a second connection (see src/ws_manager.py).
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
    summary="List notifications",
    description="Returns the current user's notifications, newest first. unread_only filters to unread ones only.",
)
async def list_notifications(
    unread_only: bool = Query(False, description="Unread only"),
    db=Depends(get_db),
    current_user: User = Depends(get_user),
) -> list[NotificationRead]:
    notifications = await notifications_service.list_notifications(db, current_user.id, unread_only)
    return [NotificationRead.model_validate(n) for n in notifications]


@router.post(
    "/notifications/{id}/read",
    response_model=NotificationRead,
    summary="Mark a notification as read",
)
async def mark_read(id: uuid.UUID, db=Depends(get_db), current_user: User = Depends(get_user)) -> NotificationRead:
    notification = await notifications_service.mark_read(db, current_user.id, id)
    return NotificationRead.model_validate(notification)


@router.post(
    "/notifications/read-all",
    status_code=204,
    summary="Mark all notifications as read",
)
async def mark_all_read(db=Depends(get_db), current_user: User = Depends(get_user)) -> None:
    await notifications_service.mark_all_read(db, current_user.id)


@router.delete(
    "/notifications/{id}",
    status_code=204,
    summary="Delete a notification",
    description="Deletes a single notification belonging to the current user. 404 if not found or belongs to another user.",
)
async def delete_notification(id: uuid.UUID, db=Depends(get_db), current_user: User = Depends(get_user)) -> None:
    await notifications_service.delete_notification(db, current_user.id, id)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user: User | None = Depends(get_user_ws)) -> None:
    # * The single WS entry point for the whole app (notifications now, messenger later, same socket).
    # ! We close BEFORE accept() if authorization fails — the ASGI server will return a handshake
    # ! rejection to the client instead of abruptly dropping an already-established connection.
    if user is None:
        await websocket.close(code=1008)
        return
    await manager.connect(user.id, websocket)
    try:
        async for _ in websocket.iter_text():
            pass  # * the client isn't obligated to send anything — the channel is server-push only
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: user %s", user.id)
    finally:
        manager.disconnect(user.id)
