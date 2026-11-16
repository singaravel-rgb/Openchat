from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Automation Rule schemas
class AutomationRuleBase(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_event: str
    conditions: list[dict]  # JSON array of condition objects
    actions: list[dict]  # JSON array of action objects
    is_active: bool = True


class AutomationRuleCreate(AutomationRuleBase):
    pass


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_event: Optional[str] = None
    conditions: Optional[list[dict]] = None
    actions: Optional[list[dict]] = None
    is_active: Optional[bool] = None


class AutomationRuleResponse(AutomationRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime


# Automation Rule Execution schemas
class AutomationRuleExecutionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_id: int
    trigger_event: str
    trigger_payload: dict
    actions_taken: list[dict]
    success: bool
    error_message: Optional[str]
    created_at: datetime