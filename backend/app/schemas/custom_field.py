from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CustomFieldBase(BaseModel):
    name: str
    field_key: str
    field_type: str = "text"
    options: Optional[str] = None  # JSON string for dropdown options
    is_required: bool = False
    is_active: bool = True


class CustomFieldCreate(CustomFieldBase):
    pass


class CustomFieldUpdate(BaseModel):
    name: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[str] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None


class CustomFieldResponse(CustomFieldBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class ConversationCustomFieldValue(BaseModel):
    custom_field_id: int
    field_key: str
    field_name: str
    field_type: str
    value: str


class ConversationCustomFieldSet(BaseModel):
    field_values: dict[str, str]  # field_key -> value