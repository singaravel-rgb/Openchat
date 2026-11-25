from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.setting import Setting
from app.models.user import User
from app.schemas.setting import SettingResponse, SettingUpdate, SettingsBulkUpdate

router = APIRouter(prefix="/admin/settings", tags=["Admin Settings"])


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


DEFAULT_SETTINGS = {
    "general": {
        "app_name": {"value": "OpenChat", "description": "Application name displayed in UI"},
        "support_email": {"value": "support@openchat.io", "description": "Support email address"},
        "default_language": {"value": "en", "description": "Default language code"},
        "timezone": {"value": "UTC", "description": "Default timezone"},
        "require_2fa": {"value": False, "description": "Require two-factor authentication for admins"},
        "session_timeout_minutes": {"value": 60, "description": "Auto-logout after inactivity (minutes)"},
    },
    "notifications": {
        "in_app_new_conversation": {"value": True, "description": "In-app notification for new conversations"},
        "in_app_conversation_assigned": {"value": True, "description": "In-app notification when conversation assigned"},
        "in_app_new_message": {"value": True, "description": "In-app notification for new messages"},
        "in_app_conversation_resolved": {"value": False, "description": "In-app notification when conversation resolved"},
        "in_app_mentions": {"value": True, "description": "In-app notification for mentions"},
        "in_app_sla_warning": {"value": True, "description": "In-app notification for SLA warnings"},
        "in_app_sla_breach": {"value": True, "description": "In-app notification for SLA breaches"},
        "email_new_conversation": {"value": True, "description": "Email notification for new conversations"},
        "email_conversation_assigned": {"value": True, "description": "Email notification when conversation assigned"},
        "email_daily_summary": {"value": False, "description": "Daily digest email"},
        "email_weekly_report": {"value": False, "description": "Weekly performance report email"},
        "email_sla_breach": {"value": True, "description": "Email alert for SLA breaches"},
        "notification_email": {"value": "notifications@openchat.io", "description": "Email address for notifications"},
        "push_enabled": {"value": True, "description": "Enable browser push notifications"},
        "push_new_messages": {"value": True, "description": "Push for new messages"},
        "push_assignment_changes": {"value": True, "description": "Push for assignment changes"},
        "push_sla_alerts": {"value": True, "description": "Push for SLA alerts"},
        "sound_enabled": {"value": True, "description": "Enable sound notifications"},
        "sound_type": {"value": "default", "description": "Notification sound type"},
        "sound_volume": {"value": 50, "description": "Notification volume (0-100)"},
    },
    "assignment": {
        "default_method": {"value": "round_robin", "description": "Default assignment method"},
        "auto_assign": {"value": True, "description": "Automatically assign incoming conversations"},
        "max_conversations_per_agent": {"value": 10, "description": "Max concurrent conversations per agent"},
        "first_response_timeout_seconds": {"value": 5, "description": "Seconds before SLA warning alert is sent for unanswered customer message"},
        "second_escalation_timeout_seconds": {"value": 30, "description": "Seconds before unanswered ticket is auto-escalated and reassigned"},
        "rules": {"value": [], "description": "Assignment rules (JSON array)"},
    },
    "escalation": {
        "first_response_timeout_seconds": {"value": 5, "description": "First response warning deadline (seconds)"},
        "second_escalation_timeout_seconds": {"value": 30, "description": "Second escalation & reassignment deadline (seconds)"},
        "unassigned_alert_threshold_seconds": {"value": 10, "description": "Alert admins if unassigned in pending queue (seconds)"},
        "auto_escalate_enabled": {"value": True, "description": "Enable automated reassignment on missed deadline"},
    },
    "business_hours": {
        "business_hours_timezone": {"value": "UTC", "description": "Support operating timezone (IANA e.g. Asia/Kolkata, America/New_York, UTC)"},
        "out_of_hours_message": {
            "value": "We are currently outside our business hours. Your conversation has been queued and our support team will respond during our next working period.",
            "description": "Custom message shown to customers outside business hours",
        },
    },
}


def get_or_create_settings(db: Session, category: str) -> dict[str, Setting]:
    """Get all settings for a category, creating defaults idempotently without key collisions."""
    settings = db.query(Setting).filter(Setting.category == category).all()
    setting_map = {s.key: s for s in settings}

    defaults = DEFAULT_SETTINGS.get(category, {})
    created = False
    for key, config in defaults.items():
        if key not in setting_map:
            existing_global = db.query(Setting).filter(Setting.key == key).first()
            if existing_global:
                setting_map[key] = existing_global
            else:
                setting = Setting(
                    key=key,
                    value=config["value"],
                    category=category,
                    description=config["description"],
                )
                db.add(setting)
                setting_map[key] = setting
                created = True

    if created:
        db.commit()
    return setting_map


@router.get("/{category}", response_model=list[SettingResponse])
def get_settings(
    category: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if category not in DEFAULT_SETTINGS:
        raise HTTPException(status_code=404, detail="Invalid settings category")

    settings = get_or_create_settings(db, category)
    return [
        SettingResponse(
            key=key,
            value=setting.value,
            category=setting.category,
            description=setting.description,
        )
        for key, setting in settings.items()
    ]


@router.patch("/{category}/{key}", response_model=SettingResponse)
def update_setting(
    category: str,
    key: str,
    data: SettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if category not in DEFAULT_SETTINGS:
        raise HTTPException(status_code=404, detail="Invalid settings category")

    defaults = DEFAULT_SETTINGS.get(category, {})
    if key not in defaults:
        raise HTTPException(status_code=404, detail="Setting not found")

    setting = db.query(Setting).filter(Setting.category == category, Setting.key == key).first()
    if not setting:
        setting = Setting(key=key, value=data.value, category=category, description=defaults[key]["description"])
        db.add(setting)
    else:
        setting.value = data.value
    db.commit()
    db.refresh(setting)

    return SettingResponse(
        key=setting.key,
        value=setting.value,
        category=setting.category,
        description=setting.description,
    )


@router.patch("/{category}", response_model=list[SettingResponse])
def bulk_update_settings(
    category: str,
    data: SettingsBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if category not in DEFAULT_SETTINGS:
        raise HTTPException(status_code=404, detail="Invalid settings category")

    defaults = DEFAULT_SETTINGS.get(category, {})
    updated = []

    for key, value in data.settings.items():
        if key not in defaults:
            continue
        setting = db.query(Setting).filter(Setting.category == category, Setting.key == key).first()
        if not setting:
            setting = Setting(key=key, value=value, category=category, description=defaults[key]["description"])
            db.add(setting)
        else:
            setting.value = value
        db.commit()
        db.refresh(setting)
        updated.append(
            SettingResponse(
                key=setting.key,
                value=setting.value,
                category=setting.category,
                description=setting.description,
            )
        )

    return updated