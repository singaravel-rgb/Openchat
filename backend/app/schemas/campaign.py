from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Campaign schemas
class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None
    message_template: str
    target_criteria: Optional[str] = None  # JSON string


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    message_template: Optional[str] = None
    target_criteria: Optional[str] = None
    status: Optional[str] = None


class CampaignResponse(CampaignBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    sent_count: int
    delivered_count: int
    failed_count: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime]


# Campaign Message schemas
class CampaignMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: int
    customer_id: int
    conversation_id: Optional[int]
    status: str
    message_content: str
    error_message: Optional[str]
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    created_at: datetime


# Campaign launch
class CampaignLaunch(BaseModel):
    customer_ids: Optional[list[int]] = None  # If not provided, uses target_criteria
    dry_run: bool = False