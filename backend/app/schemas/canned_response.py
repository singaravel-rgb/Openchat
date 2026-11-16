from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CannedResponseBase(BaseModel):
    title: str
    content: str
    category: str = "general"
    shortcut: Optional[str] = None
    is_active: bool = True


class CannedResponseCreate(CannedResponseBase):
    pass


class CannedResponseUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    shortcut: Optional[str] = None
    is_active: Optional[bool] = None


class CannedResponseResponse(CannedResponseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_id: Optional[int]
    usage_count: int
    created_at: datetime
    updated_at: datetime


class CannedResponseUseResponse(BaseModel):
    content: str
    title: str