from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr


class AgentProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_available: bool = False
    is_approved: bool = False
    max_conversations: int = 5
    active_conversations: int = 0


class UserDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    role_changed_at: datetime | None = None
    created_by: UserSummary | None = None
    last_role_changed_by: UserSummary | None = None
    agent_profile: AgentProfileSummary | None = None


class UserInviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(pattern="^(super_admin|admin|agent)$")
    full_name: str | None = None


class UserInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: str
    status: str
    token: str
    is_verified: bool = False
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None = None
    invited_by: UserSummary | None = None


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: str | None = Field(default=None, pattern="^(super_admin|admin|agent)$")
    is_active: bool | None = None


class InvitationAcceptRequest(BaseModel):
    token: str
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class InvitationInspectResponse(BaseModel):
    email: EmailStr
    role: str
    expires_at: datetime
    is_expired: bool

