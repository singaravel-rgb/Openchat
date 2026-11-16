from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=255)
    priority: Optional[str] = Field(default="normal", max_length=20)
    tags: Optional[List[str]] = None
    channel: Optional[str] = Field(default="website", max_length=30)


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    is_internal: bool = False
    client_message_id: Optional[str] = Field(default=None, max_length=100)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: Optional[int]
    sender_type: str
    message_type: str
    content: str
    is_internal: bool
    delivery_status: Optional[str] = "delivered"
    processed_at: Optional[datetime] = None
    client_message_id: Optional[str] = None
    ai_metadata: Optional[dict] = None
    created_at: datetime


class ConversationUpdate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=255)
    priority: Optional[str] = Field(default=None, max_length=20)
    tags: Optional[List[str]] = None


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    assigned_agent_id: Optional[int]
    subject: Optional[str]
    status: str
    channel: str
    priority: Optional[str] = "normal"
    tags: Optional[List[str]] = None
    resolution_details: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    customer_last_read_at: Optional[datetime] = None
    agent_last_read_at: Optional[datetime] = None


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse]
    assignment_history: Optional[List[dict]] = None


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    customer_name: str
    customer_email: str
    assigned_agent_id: Optional[int]
    assigned_agent_name: Optional[str]
    subject: Optional[str]
    status: str
    priority: Optional[str] = "normal"
    tags: Optional[List[str]] = None
    channel: Optional[str] = "website"
    last_message: Optional[str]
    last_message_at: Optional[datetime]
    unread_count: int = 0


class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]
    total: int
    limit: int
    offset: int


class AssignRequest(BaseModel):
    agent_id: Optional[int] = None
    note: Optional[str] = None


class StatusUpdateRequest(BaseModel):
    status: Optional[str] = None
    resolution_details: Optional[str] = None
