from typing import Any, Optional
from pydantic import BaseModel


class SettingResponse(BaseModel):
    key: str
    value: Any
    category: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class SettingUpdate(BaseModel):
    value: Any


class SettingsBulkUpdate(BaseModel):
    settings: dict[str, Any]