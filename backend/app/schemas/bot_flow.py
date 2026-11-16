from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Bot Flow schemas
class BotFlowBase(BaseModel):
    name: str
    description: Optional[str] = None
    initial_greeting: Optional[str] = None
    status: str = "draft"
    is_default: bool = False


class BotFlowCreate(BotFlowBase):
    pass


class BotFlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    initial_greeting: Optional[str] = None
    status: Optional[str] = None
    is_default: Optional[bool] = None


class BotFlowResponse(BotFlowBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime


# Bot Flow Step schemas
class BotFlowStepBase(BaseModel):
    step_key: str
    step_type: str = "message"
    message_text: Optional[str] = None
    options: Optional[str] = None
    next_step_key: Optional[str] = None
    is_terminal: bool = False
    sort_order: int = 0


class BotFlowStepCreate(BotFlowStepBase):
    pass


class BotFlowStepUpdate(BaseModel):
    step_type: Optional[str] = None
    message_text: Optional[str] = None
    options: Optional[str] = None
    next_step_key: Optional[str] = None
    is_terminal: Optional[bool] = None
    sort_order: Optional[int] = None


class BotFlowStepResponse(BotFlowStepBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flow_id: int
    created_at: datetime


# Bot Flow Issue schemas
class BotFlowIssueBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_step_key: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class BotFlowIssueCreate(BotFlowIssueBase):
    pass


class BotFlowIssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_step_key: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class BotFlowIssueResponse(BotFlowIssueBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    flow_id: int
    created_at: datetime


# Publish flow
class BotFlowPublish(BaseModel):
    version_comment: Optional[str] = None