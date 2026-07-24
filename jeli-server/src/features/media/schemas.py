# Pydantic schemas for the media feature.
from pydantic import BaseModel


class MediaUploadResponse(BaseModel):
    url: str
