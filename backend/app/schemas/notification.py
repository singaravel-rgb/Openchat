from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationPriority, NotificationType


class NotificationBase(BaseModel):
    type: NotificationType
    priority: NotificationPriority = NotificationPriority.NORMAL
    title: str
    message: Optional[str] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None


class NotificationCreate(NotificationBase):
    user_id: int


class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None


class NotificationRead(NotificationBase):
    id: int
    user_id: int
    is_read: bool
    read_at: Optional[datetime] = None
    email_sent: bool = False
    email_status: str = "not_applicable"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationList(BaseModel):
    notifications: list[NotificationRead]
    unread_count: int


class NotificationPreferences(BaseModel):
    in_app_assigned: bool = True
    in_app_new_message: bool = True
    in_app_reassigned: bool = True
    in_app_pending: bool = True
    in_app_sla_warning: bool = True
    in_app_sla_breach: bool = True
    email_assigned: bool = True
    email_new_message: bool = False
    email_reassigned: bool = True
    email_pending: bool = False
    email_sla_warning: bool = True
    email_sla_breach: bool = True