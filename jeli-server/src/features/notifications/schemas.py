# Pydantic schemas for the notifications feature.
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    payload: dict
    is_read: bool
    created_at: datetime
