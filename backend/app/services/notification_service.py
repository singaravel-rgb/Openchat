from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationPriority, NotificationType


def create_notification(
    db: Session,
    user_id: int,
    type: NotificationType,
    title: str,
    message: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    priority: NotificationPriority = NotificationPriority.NORMAL,
) -> Notification:
    """Create a notification for a user."""
    notification = Notification(
        user_id=user_id,
        type=type,
        priority=priority,
        title=title,
        message=message,
        reference_type=reference_type,
        reference_id=reference_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification