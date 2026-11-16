from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class AttachmentBase(BaseModel):
    filename: str
    original_filename: str
    mime_type: str
    file_size: int
    is_image: bool = False


class AttachmentCreate(AttachmentBase):
    conversation_id: int
    message_id: Optional[int] = None


class AttachmentResponse(AttachmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    message_id: Optional[int]
    uploaded_by_id: Optional[int]
    file_path: str
    created_at: datetime


class AttachmentUploadResponse(BaseModel):
    attachment: AttachmentResponse
    message: str