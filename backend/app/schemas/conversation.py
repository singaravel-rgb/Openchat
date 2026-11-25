from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field
from app.schemas.attachment import AttachmentResponse


class ConversationCreate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=255)
    priority: Optional[str] = Field(default="normal", max_length=20)
    tags: Optional[List[str]] = None
    channel: Optional[str] = Field(default="website", max_length=30)


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    is_internal: bool = False
    client_message_id: Optional[str] = Field(default=None, max_length=100)
    expected_version: Optional[int] = None


class MessageEdit(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class MessageRetract(BaseModel):
    reason: Optional[str] = None


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
    edited_at: Optional[datetime] = None
    edited_by_id: Optional[int] = None
    is_retracted: bool = False
    retracted_at: Optional[datetime] = None
    original_conversation_id: Optional[int] = None
    attachments: Optional[List[AttachmentResponse]] = Field(default_factory=list)


class ConversationUpdate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=255)
    priority: Optional[str] = Field(default=None, max_length=20)
    tags: Optional[List[str]] = None
    expected_version: Optional[int] = None


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chat_id: Optional[str] = None
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
    merged_into_id: Optional[int] = None
    version: int = 1


class ConversationLinkCreate(BaseModel):
    target_conversation_id: Optional[int] = None
    target_chat_id: Optional[str] = None


class ConversationLinkItem(BaseModel):
    id: int
    linked_conversation_id: int
    chat_id: Optional[str] = None
    subject: Optional[str] = None
    status: str
    customer_id: int
    customer_name: Optional[str] = None
    created_at: datetime
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None


class ConversationMergeRequest(BaseModel):
    target_conversation_id: Optional[int] = None
    target_chat_id: Optional[str] = None
    confirm_cross_customer: bool = False


class GlobalNoteUpdate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=20000)
    content: Optional[str] = Field(default=None, max_length=20000)

    @property
    def text(self) -> str:
        if self.note is not None:
            return self.note
        if self.content is not None:
            return self.content
        return ""


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse]
    assignment_history: Optional[List[dict]] = None

    # Persistent Global Note (internal only, for agents and admins)
    global_note: Optional[str] = None
    global_note_updated_at: Optional[datetime] = None
    global_note_updated_by_id: Optional[int] = None
    global_note_updated_by_name: Optional[str] = None

    # Convenience fields mirroring the inbox card, so a single detail fetch can
    # reselect a conversation (e.g. after a refresh or from a notification link).
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    user_last_read_at: Optional[datetime] = None
    last_read_message_id: Optional[int] = None
    merged_into_id: Optional[int] = None
    linked_conversations: Optional[List[ConversationLinkItem]] = None


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chat_id: Optional[str] = None
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
    user_last_read_at: Optional[datetime] = None
    merged_into_id: Optional[int] = None
    version: int = 1


class MarkReadRequest(BaseModel):
    last_message_id: Optional[int] = None


class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]
    total: int
    limit: int
    offset: int


class AssignRequest(BaseModel):
    agent_id: Optional[int] = None
    note: Optional[str] = None
    expected_version: Optional[int] = None


class StatusUpdateRequest(BaseModel):
    status: Optional[str] = None
    resolution_details: Optional[str] = None
    expected_version: Optional[int] = None
