# Pydantic-схемы фичи media.
from pydantic import BaseModel


class MediaUploadResponse(BaseModel):
    url: str
