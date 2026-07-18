# Глобальный менеджер WebSocket-соединений.
# Общий для фич messenger и notifications: одно соединение на пользователя,
# сообщения разных фич мультиплексируются в нём по полю "type".
import logging
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    # * Хранит активные WebSocket-соединения и рассылает по user_id.

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, WebSocket] = {}

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        # * Принимает соединение и регистрирует его для пользователя.
        # @param user_id: идентификатор пользователя, установившего соединение
        # @param websocket: активное соединение WebSocket
        await websocket.accept()
        self._connections[user_id] = websocket
        logger.info("WebSocket connected for user %s", user_id)

    def disconnect(self, user_id: uuid.UUID) -> None:
        self._connections.pop(user_id, None)
        logger.info("WebSocket disconnected for user %s", user_id)

    async def send_to_user(self, user_id: uuid.UUID, payload: dict) -> bool:
        # * Отправляет payload пользователю, если он сейчас онлайн.
        # @param user_id: получатель
        # @param payload: словарь с полем "type", определяющим фичу-отправителя
        # ? Возвращает False, если пользователь оффлайн — вызывающая фича решает,
        # ? нужно ли в этом случае что-то сохранять (например, notifications всегда пишет в БД).
        websocket = self._connections.get(user_id)
        if websocket is None:
            return False
        try:
            await websocket.send_json(payload)
            return True
        except Exception:
            logger.warning("Failed to send WS payload to user %s, dropping connection", user_id, exc_info=True)
            self.disconnect(user_id)
            return False

    def is_online(self, user_id: uuid.UUID) -> bool:
        return user_id in self._connections


manager = ConnectionManager()
