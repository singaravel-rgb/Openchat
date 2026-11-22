from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field


class WidgetConfigBase(BaseModel):
    widget_title: str = Field(default="OpenChat Support", max_length=100)
    brand_name: str = Field(default="OpenChat", max_length=100)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: str = Field(default="#2563eb", max_length=20)
    launcher_position: str = Field(default="bottom-right", pattern="^(bottom-right|bottom-left)$")
    welcome_message: str = Field(default="Hi! How can we help you today?", max_length=500)
    greeting_text: str = Field(default="Start a conversation with our team.", max_length=500)
    widget_visibility: bool = True
    allowed_domains: List[str] = Field(default_factory=list)
    widget_availability: bool = True
    hide_launcher_on_help_page: bool = True
    show_agent_avatar: bool = True
    require_email: bool = False
    # Host identity verification (authenticated host mode)
    host_identity_jwks_url: Optional[str] = Field(default=None, max_length=500)
    host_identity_issuer: Optional[str] = Field(default=None, max_length=255)
    host_identity_audience: str = Field(default="openchat-widget", max_length=255)
    host_identity_public_key: Optional[str] = Field(default=None, max_length=5000)


class WidgetConfigUpdate(BaseModel):
    widget_title: Optional[str] = Field(default=None, max_length=100)
    brand_name: Optional[str] = Field(default=None, max_length=100)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: Optional[str] = Field(default=None, max_length=20)
    launcher_position: Optional[str] = Field(default=None, pattern="^(bottom-right|bottom-left)$")
    welcome_message: Optional[str] = Field(default=None, max_length=500)
    greeting_text: Optional[str] = Field(default=None, max_length=500)
    widget_visibility: Optional[bool] = None
    allowed_domains: Optional[List[str]] = None
    widget_availability: Optional[bool] = None
    hide_launcher_on_help_page: Optional[bool] = None
    show_agent_avatar: Optional[bool] = None
    require_email: Optional[bool] = None
    host_identity_jwks_url: Optional[str] = Field(default=None, max_length=500)
    host_identity_issuer: Optional[str] = Field(default=None, max_length=255)
    host_identity_audience: Optional[str] = Field(default=None, max_length=255)
    host_identity_public_key: Optional[str] = Field(default=None, max_length=5000)


class WidgetConfigResponse(WidgetConfigBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    updated_at: datetime


class WidgetPublicConfig(BaseModel):
    widget_title: str
    brand_name: str
    logo_url: Optional[str] = None
    primary_color: str
    launcher_position: str
    welcome_message: str
    greeting_text: str
    widget_visibility: bool
    widget_availability: bool
    hide_launcher_on_help_page: bool
    show_agent_avatar: bool
    require_email: bool
    bot_flow: Optional[dict] = None


class WidgetSessionCreate(BaseModel):
    guest_name: Optional[str] = Field(default=None, max_length=255)
    guest_email: Optional[str] = Field(default=None, max_length=255)
    page_url: Optional[str] = Field(default=None, max_length=500)
    is_help_page: bool = False
    host_identity_token: Optional[str] = Field(default=None, description="JWT signed by host backend with customer identity")


class WidgetSessionResponse(BaseModel):
    session_token: str
    expires_at: datetime
    is_guest: bool


class WidgetMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    client_message_id: Optional[str] = Field(default=None, max_length=100)


class WidgetConversationCreate(BaseModel):
    subject: Optional[str] = Field(default=None, max_length=255)
    initial_message: Optional[str] = Field(default=None, max_length=10000)
    client_message_id: Optional[str] = Field(default=None, max_length=100)


class WidgetAttachment(BaseModel):
    id: int
    filename: str
    original_filename: str
    mime_type: str
    file_size: int
    is_image: bool = False
    download_url: str


class WidgetMessage(BaseModel):
    id: int
    sender_type: str
    message_type: str
    content: str
    created_at: datetime
    delivery_status: Optional[str] = "delivered"
    ai_metadata: Optional[dict] = None
    attachments: Optional[List[WidgetAttachment]] = Field(default_factory=list)


class WidgetConversation(BaseModel):
    id: int
    chat_id: Optional[str] = None
    subject: Optional[str]
    status: str
    updated_at: datetime
    created_at: datetime
    last_message: Optional[str] = None
    unread_count: int = 0


class WidgetConversationDetail(WidgetConversation):
    messages: List[WidgetMessage]
