from datetime import date, datetime, time
from typing import Optional
from pydantic import BaseModel, ConfigDict


# Business Hours schemas
class BusinessHoursBase(BaseModel):
    day_of_week: int  # 0=Monday, 6=Sunday
    start_time: time
    end_time: time
    is_closed: bool = False
    is_active: bool = True


class BusinessHoursCreate(BusinessHoursBase):
    pass


class BusinessHoursUpdate(BaseModel):
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    is_closed: Optional[bool] = None
    is_active: Optional[bool] = None


class BusinessHoursResponse(BusinessHoursBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime


# Holiday schemas
class HolidayBase(BaseModel):
    name: str
    holiday_date: date
    is_recurring: bool = False
    is_active: bool = True


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    holiday_date: Optional[date] = None
    is_recurring: Optional[bool] = None
    is_active: Optional[bool] = None


class HolidayResponse(HolidayBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime