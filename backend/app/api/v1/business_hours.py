from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.business_hours import BusinessHours, Holiday
from app.models.user import User
from app.schemas.business_hours import (
    BusinessHoursCreate,
    BusinessHoursResponse,
    BusinessHoursUpdate,
    HolidayCreate,
    HolidayResponse,
    HolidayUpdate,
)

router = APIRouter(prefix="/business-hours", tags=["Business Hours"])


def require_admin_or_agent(current_user: User = Depends(require_roles("agent", "admin"))) -> User:
    return current_user


# ===== Business Hours Endpoints =====

@router.post("", response_model=BusinessHoursResponse, status_code=status.HTTP_201_CREATED)
def create_business_hours(
    data: BusinessHoursCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create business hours for a day of the week."""
    existing = db.query(BusinessHours).filter(BusinessHours.day_of_week == data.day_of_week).first()
    if existing:
        raise HTTPException(status_code=409, detail="Business hours already exist for this day")

    bh = BusinessHours(
        day_of_week=data.day_of_week,
        start_time=data.start_time,
        end_time=data.end_time,
        is_closed=data.is_closed,
        is_active=data.is_active,
    )
    db.add(bh)
    db.commit()
    db.refresh(bh)
    return bh


@router.get("", response_model=list[BusinessHoursResponse])
def list_business_hours(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List business hours."""
    query = db.query(BusinessHours).order_by(BusinessHours.day_of_week)
    if is_active is not None:
        query = query.filter(BusinessHours.is_active == is_active)
    return query.all()


# ===== Holiday Endpoints =====

@router.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
def create_holiday(
    data: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Create a holiday."""
    existing = db.query(Holiday).filter(Holiday.holiday_date == data.holiday_date).first()
    if existing:
        raise HTTPException(status_code=409, detail="Holiday already exists for this date")

    holiday = Holiday(
        name=data.name,
        holiday_date=data.holiday_date,
        is_recurring=data.is_recurring,
        is_active=data.is_active,
    )
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday


@router.get("/holidays", response_model=list[HolidayResponse])
def list_holidays(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """List holidays."""
    query = db.query(Holiday).order_by(Holiday.holiday_date)
    if is_active is not None:
        query = query.filter(Holiday.is_active == is_active)
    return query.all()


@router.get("/holidays/{holiday_id}", response_model=HolidayResponse)
def get_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get a specific holiday."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return holiday


@router.patch("/holidays/{holiday_id}", response_model=HolidayResponse)
def update_holiday(
    holiday_id: int,
    data: HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update a holiday."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(holiday, field, value)

    db.commit()
    db.refresh(holiday)
    return holiday


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete a holiday."""
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    db.delete(holiday)
    db.commit()
    return None


@router.get("/is-open", response_model=dict)
def is_business_open(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Check if the business is currently open based on business hours and holidays."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    day_of_week = now.weekday()  # 0=Monday, 6=Sunday
    current_time = now.time()
    today_date = now.date()

    # Check if today is a holiday
    holiday = (
        db.query(Holiday)
        .filter(Holiday.holiday_date == today_date, Holiday.is_active == True)  # noqa: E712
        .first()
    )
    if holiday:
        return {"is_open": False, "reason": f"Holiday: {holiday.name}"}

    # Check business hours for today
    bh = (
        db.query(BusinessHours)
        .filter(BusinessHours.day_of_week == day_of_week, BusinessHours.is_active == True)  # noqa: E712
        .first()
    )

    if not bh or bh.is_closed:
        return {"is_open": False, "reason": "Closed on this day"}

    if bh.start_time <= current_time <= bh.end_time:
        return {"is_open": True, "reason": "Within business hours"}
    else:
        return {"is_open": False, "reason": "Outside business hours"}


# ===== Day-specific Business Hours Endpoints =====

@router.get("/{bh_id}", response_model=BusinessHoursResponse)
def get_business_hours(
    bh_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Get business hours for a specific day."""
    bh = db.query(BusinessHours).filter(BusinessHours.id == bh_id).first()
    if not bh:
        raise HTTPException(status_code=404, detail="Business hours not found")
    return bh


@router.patch("/{bh_id}", response_model=BusinessHoursResponse)
def update_business_hours(
    bh_id: int,
    data: BusinessHoursUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Update business hours."""
    bh = db.query(BusinessHours).filter(BusinessHours.id == bh_id).first()
    if not bh:
        raise HTTPException(status_code=404, detail="Business hours not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(bh, field, value)

    db.commit()
    db.refresh(bh)
    return bh


@router.delete("/{bh_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business_hours(
    bh_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_agent),
):
    """Delete business hours."""
    bh = db.query(BusinessHours).filter(BusinessHours.id == bh_id).first()
    if not bh:
        raise HTTPException(status_code=404, detail="Business hours not found")

    db.delete(bh)
    db.commit()
    return None