from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="#3b82f6", max_length=30)
    description: Optional[str] = None
    is_active: bool = True


class TagUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=30)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str
    description: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None
