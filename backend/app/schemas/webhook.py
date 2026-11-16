from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Webhook schemas
class WebhookBase(BaseModel):
    name: str
    url: str
    secret: Optional[str] = None
    events: list[str]  # e.g., ["conversation.created", "conversation.resolved", "message.created"]
    is_active: bool = True


class WebhookCreate(WebhookBase):
    pass


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[list[str]] = None
    is_active: Optional[bool] = None


class WebhookResponse(WebhookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime


# Webhook Delivery schemas
class WebhookDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    webhook_id: int
    event: str
    response_status: Optional[int]
    response_body: Optional[str]
    duration_ms: Optional[int]
    created_at: datetime


# Webhook trigger (for testing)
class WebhookTest(BaseModel):
    event: str
    payload: dict