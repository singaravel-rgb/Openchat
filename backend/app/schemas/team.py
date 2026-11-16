from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Team schemas
class TeamBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    is_active: bool = True


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class TeamResponse(TeamBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    member_count: int = 0


class TeamMemberAdd(BaseModel):
    user_id: int


# Department schemas
class DepartmentBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    team_id: Optional[int] = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    team_id: Optional[int] = None
    is_active: Optional[bool] = None


class DepartmentResponse(DepartmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    team_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime