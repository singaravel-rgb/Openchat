from datetime import datetime, timedelta
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SLAConfigBase(BaseModel):
    name: str
    description: Optional[str] = None
    response_time_minutes: int
    resolution_time_minutes: int
    is_default: bool = False
    is_active: bool = True


class SLAConfigCreate(SLAConfigBase):
    pass


class SLAConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    response_time_minutes: Optional[int] = None
    resolution_time_minutes: Optional[int] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class SLAConfigRead(SLAConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SLAStatus(BaseModel):
    conversation_id: int
    sla_config_name: Optional[str] = None
    response_due_at: Optional[datetime] = None
    resolution_due_at: Optional[datetime] = None
    response_breached: bool = False
    resolution_breached: bool = False
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    response_remaining_minutes: Optional[int] = None
    resolution_remaining_minutes: Optional[int] = None
    response_status: str  # 'ok', 'warning', 'breached', 'met'
    resolution_status: str  # 'ok', 'warning', 'breached', 'met'