# Global WebSocket connection manager.
# Shared between the messenger and notifications features: one connection per user,
# messages from different features are multiplexed over it via the "type" field.
import logging
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    # * Stores active WebSocket connections and dispatches messages by user_id.

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, WebSocket] = {}

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket) -> None:
        # * Accepts the connection and registers it for the user.
        # @param user_id: identifier of the user who established the connection
        # @param websocket: the active WebSocket connection
        await websocket.accept()
        self._connections[user_id] = websocket
        logger.info("WebSocket connected for user %s", user_id)

    def disconnect(self, user_id: uuid.UUID) -> None:
        self._connections.pop(user_id, None)
        logger.info("WebSocket disconnected for user %s", user_id)

    async def send_to_user(self, user_id: uuid.UUID, payload: dict) -> bool:
        # * Sends the payload to the user if they are currently online.
        # @param user_id: the recipient
        # @param payload: a dict with a "type" field identifying the sending feature
        # ? Returns False if the user is offline — the calling feature decides whether
        # ? anything needs to be persisted in that case (e.g. notifications always writes to the DB).
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
