from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class AdminAgentCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    max_conversations: int = Field(default=5, ge=1, le=50)
    is_available: bool = False


class AgentProfileSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    is_available: bool = False
    is_approved: bool = False
    max_conversations: int = 5
    active_conversations: int = 0


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    agent_profile: AgentProfileSummary | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)


class PasswordResetValidateResponse(BaseModel):
    valid: bool
    email: Optional[str] = None
    message: Optional[str] = None


class GenericMessageResponse(BaseModel):
    message: str


class AdminPasswordResetResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None
    reset_url: Optional[str] = None
    expires_at: Optional[datetime] = None
