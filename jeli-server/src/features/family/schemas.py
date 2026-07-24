# Pydantic schemas for the family feature.
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FamilyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_user_id: uuid.UUID
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class FamilyUpsertRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""
