# Pydantic-схемы фичи messenger.
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatCreateRequest(BaseModel):
    person_id: uuid.UUID


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    chat_id: uuid.UUID
    sender_id: uuid.UUID
    content: str
    created_at: datetime


class ChatRead(BaseModel):
    id: uuid.UUID
    peer_user_id: uuid.UUID
    created_at: datetime
    last_message: MessageRead | None = None
