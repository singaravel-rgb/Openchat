from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.user import User
from app.schemas.notification import (
    NotificationCreate,
    NotificationList,
    NotificationPreferences,
    NotificationRead,
    NotificationUpdate,
)
from app.services.email_service import send_email_with_status
from app.services.notification_service import get_user_notification_prefs

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationList)
def list_notifications(
    is_read: Optional[bool] = Query(None),
    type: Optional[NotificationType] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Notification).where(Notification.user_id == current_user.id)

    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    if type:
        query = query.where(Notification.type == type)

    # Get unread count
    unread_count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )

    # Get paginated results
    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    notifications = db.scalars(query).all()

    return NotificationList(
        notifications=[NotificationRead.model_validate(n) for n in notifications],
        unread_count=unread_count or 0,
    )


@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,
        )
    )
    return {"unread_count": count or 0}


@router.post("", response_model=NotificationRead)
def create_notification(
    notification_in: NotificationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Only admins can create notifications for other users
    if notification_in.user_id != current_user.id:
        from app.models.user import User as UserModel
        current_user_obj = db.get(UserModel, current_user.id)
        if not current_user_obj or current_user_obj.role not in ("admin", "super_admin"):
            raise HTTPException(status_code=403, detail="Not authorized to create notifications for other users")

    notification = Notification(
        user_id=notification_in.user_id,
        type=notification_in.type,
        priority=notification_in.priority,
        title=notification_in.title,
        message=notification_in.message,
        reference_type=notification_in.reference_type,
        reference_id=notification_in.reference_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    # Send email notification if SMTP is configured
    email_sent = False
    email_status = "not_applicable"
    try:
        target_user = db.get(User, notification_in.user_id)
        if target_user and target_user.email:
            email_sent, email_status = send_email_with_status(
                to_email=target_user.email,
                subject=f"[OpenChat] {notification_in.title}",
                body=notification_in.message or notification_in.title,
            )
    except Exception:
        email_sent = False
        email_status = "failed"

    notification.email_sent = email_sent
    notification.email_status = email_status
    db.commit()
    db.refresh(notification)

    return NotificationRead.model_validate(notification)


@router.get("/preferences", response_model=NotificationPreferences)
def get_my_notification_preferences(
    current_user: User = Depends(get_current_user),
):
    return NotificationPreferences(**get_user_notification_prefs(current_user))


@router.patch("/preferences", response_model=NotificationPreferences)
def update_my_notification_preferences(
    prefs_in: NotificationPreferences,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.notification_preferences = prefs_in.model_dump()
    db.commit()
    db.refresh(current_user)
    return NotificationPreferences(**get_user_notification_prefs(current_user))


@router.patch("/{notification_id}", response_model=NotificationRead)
def update_notification(
    notification_id: int,
    notification_in: NotificationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = db.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if notification_in.is_read is not None:
        notification.is_read = notification_in.is_read
        if notification_in.is_read:
            from datetime import datetime
            notification.read_at = datetime.utcnow()

    db.commit()
    db.refresh(notification)
    return NotificationRead.model_validate(notification)


@router.post("/mark-all-read")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import datetime
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update(
        {"is_read": True, "read_at": datetime.utcnow()},
        synchronize_session=False,
    )
    db.commit()
    return {"message": "All notifications marked as read"}