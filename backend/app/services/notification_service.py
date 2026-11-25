from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.user import User
from app.services.email_service import send_email_with_status


DEFAULT_NOTIFICATION_PREFS = {
    "in_app_assigned": True,
    "in_app_new_message": True,
    "in_app_reassigned": True,
    "in_app_pending": True,
    "in_app_sla_warning": True,
    "in_app_sla_breach": True,
    "email_assigned": True,
    "email_new_message": False,
    "email_reassigned": True,
    "email_pending": False,
    "email_sla_warning": True,
    "email_sla_breach": True,
}

TYPE_TO_PREF_SUFFIX = {
    NotificationType.CONVERSATION_ASSIGNED: "assigned",
    NotificationType.NEW_MESSAGE: "new_message",
    NotificationType.CONVERSATION_REASSIGNED: "reassigned",
    NotificationType.CONVERSATION_PENDING: "pending",
    NotificationType.SLA_WARNING: "sla_warning",
    NotificationType.SLA_BREACH: "sla_breach",
}


def get_user_notification_prefs(user: User | None) -> dict:
    prefs = dict(DEFAULT_NOTIFICATION_PREFS)
    if user and isinstance(getattr(user, "notification_preferences", None), dict):
        prefs.update(user.notification_preferences)
    return prefs


def create_notification(
    db: Session,
    user_id: int,
    type: NotificationType,
    title: str,
    message: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    dedup_key: str | None = None,
    send_email_alert: bool = True,
    dedup_window_minutes: int = 10,
) -> Notification | None:
    """Create a notification for a user, respecting preferences, deduplication, and honest email tracking."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        return None

    prefs = get_user_notification_prefs(user)
    suffix = TYPE_TO_PREF_SUFFIX.get(type)
    allow_in_app = prefs.get(f"in_app_{suffix}", True) if suffix else True
    allow_email = (prefs.get(f"email_{suffix}", False) if suffix else False) and send_email_alert

    if not allow_in_app and not allow_email:
        return None

    # Deduplication check
    if dedup_key:
        cutoff = datetime.utcnow() - timedelta(minutes=dedup_window_minutes)
        existing = (
            db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.dedup_key == dedup_key,
                Notification.created_at >= cutoff,
            )
            .first()
        )
        if existing:
            return existing

    email_sent = False
    email_status = "not_applicable"
    if allow_email and user.email:
        body_text = message or title
        if reference_type == "conversation" and reference_id:
            path = f"/agent/conversations/{reference_id}" if user.role == "agent" else f"/admin/conversations/{reference_id}"
            body_text = f"{body_text}\n\nView conversation: {path}"
        email_sent, email_status = send_email_with_status(
            to_email=user.email,
            subject=f"[OpenChat] {title}",
            body=body_text,
        )

    notification = Notification(
        user_id=user_id,
        type=type,
        priority=priority,
        title=title,
        message=message,
        reference_type=reference_type,
        reference_id=reference_id,
        email_sent=email_sent,
        email_status=email_status,
        dedup_key=dedup_key,
        is_read=False if allow_in_app else True,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification
