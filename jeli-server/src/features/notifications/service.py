# Business logic for the notifications feature: creating/reading notifications, delivery over WebSocket.
import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.notifications.exceptions import NotificationNotFoundError
from src.features.notifications.models import Notification
from src.ws_manager import manager

logger = logging.getLogger(__name__)


async def create_notification(db: AsyncSession, user_id: uuid.UUID, type_: str, payload: dict) -> Notification:
    # * ALWAYS writes to the DB (history + offline access), pushes over WS only if the user is online.
    notification = Notification(user_id=user_id, type=type_, payload=payload)
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    delivered = await manager.send_to_user(
        user_id,
        {
            "type": "notification",
            "notification": {
                "id": str(notification.id),
                "type": notification.type,
                "payload": notification.payload,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat(),
            },
        },
    )
    logger.info("Notification created: user=%s type=%s delivered=%s", user_id, type_, delivered)
    return notification


async def list_notifications(db: AsyncSession, user_id: uuid.UUID, unread_only: bool = False) -> list[Notification]:
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    result = await db.execute(query.order_by(Notification.created_at.desc()))
    return list(result.scalars())


async def get_notification_or_404(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == user_id)
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise NotificationNotFoundError()
    return notification


async def mark_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification:
    notification = await get_notification_or_404(db, user_id, notification_id)
    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification).where(Notification.user_id == user_id, Notification.is_read.is_(False)).values(is_read=True)
    )
    await db.commit()
    logger.info("All notifications marked read for user %s", user_id)


async def delete_notification(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    # * Deletes a single notification belonging to the user (ownership check — in get_notification_or_404).
    notification = await get_notification_or_404(db, user_id, notification_id)
    await db.delete(notification)
    await db.commit()
    logger.info("Notification deleted: user=%s id=%s", user_id, notification_id)
