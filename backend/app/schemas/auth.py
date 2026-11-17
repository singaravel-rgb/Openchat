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
