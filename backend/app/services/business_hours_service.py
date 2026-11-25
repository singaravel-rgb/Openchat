from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy.orm import Session

from app.models.business_hours import BusinessHours, Holiday
from app.models.setting import Setting

DEFAULT_OUT_OF_HOURS_MESSAGE = (
    "We are currently outside our business hours. Your conversation has been queued "
    "and our support team will respond during our next working period."
)


def get_business_hours_config(db: Session) -> dict:
    """Return timezone and custom out-of-hours message from settings."""
    rows = db.query(Setting).filter(Setting.category == "business_hours").all()
    cfg = {r.key: r.value for r in rows}
    return {
        "timezone": str(cfg.get("business_hours_timezone") or cfg.get("timezone") or "UTC"),
        "out_of_hours_message": str(cfg.get("out_of_hours_message") or DEFAULT_OUT_OF_HOURS_MESSAGE),
    }


def get_business_hours_status(db: Session) -> dict:
    """Check whether support is currently within configured business hours in the configured timezone."""
    cfg = get_business_hours_config(db)
    tz_name = cfg["timezone"]
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        tz = timezone.utc
        tz_name = "UTC"

    now = datetime.now(tz)
    day_of_week = now.weekday()  # 0=Monday, 6=Sunday
    current_time = now.time()
    today_date = now.date()

    # Check if any business hours are configured at all; if none, default to open
    any_bh = db.query(BusinessHours).filter(BusinessHours.is_active == True).count()  # noqa: E712

    # Check holidays (including recurring annual holidays matching month/day)
    holidays = db.query(Holiday).filter(Holiday.is_active == True).all()  # noqa: E712
    for h in holidays:
        if h.holiday_date == today_date or (
            h.is_recurring
            and h.holiday_date.month == today_date.month
            and h.holiday_date.day == today_date.day
        ):
            return {
                "is_open": False,
                "reason": f"Holiday: {h.name}",
                "timezone": tz_name,
                "out_of_hours_message": cfg["out_of_hours_message"],
            }

    if any_bh == 0:
        return {
            "is_open": True,
            "reason": "24/7 (no schedule configured)",
            "timezone": tz_name,
            "out_of_hours_message": cfg["out_of_hours_message"],
        }

    bh = (
        db.query(BusinessHours)
        .filter(BusinessHours.day_of_week == day_of_week, BusinessHours.is_active == True)  # noqa: E712
        .first()
    )
    if not bh or bh.is_closed:
        return {
            "is_open": False,
            "reason": "Closed on this day",
            "timezone": tz_name,
            "out_of_hours_message": cfg["out_of_hours_message"],
        }

    if bh.start_time <= current_time <= bh.end_time:
        return {
            "is_open": True,
            "reason": "Within business hours",
            "timezone": tz_name,
            "out_of_hours_message": cfg["out_of_hours_message"],
        }

    return {
        "is_open": False,
        "reason": "Outside business hours",
        "timezone": tz_name,
        "out_of_hours_message": cfg["out_of_hours_message"],
    }
