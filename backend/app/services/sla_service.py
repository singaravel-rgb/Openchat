from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.enums import ConversationStatus
from app.models.conversation import Conversation, SLAConfig
from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.user import User
from app.services.notification_service import create_notification


def get_default_sla_config(db: Session) -> Optional[SLAConfig]:
    """Get the default SLA configuration."""
    return db.query(SLAConfig).filter(SLAConfig.is_default == True, SLAConfig.is_active == True).first()


def get_active_sla_config(db: Session) -> Optional[SLAConfig]:
    """Get the first active SLA configuration (fallback if no default)."""
    return db.query(SLAConfig).filter(SLAConfig.is_active == True).first()


def calculate_sla_dates(
    created_at: datetime,
    sla_config: SLAConfig,
) -> tuple[datetime, datetime]:
    """Calculate SLA due dates based on conversation creation time and SLA config."""
    response_due = created_at + timedelta(minutes=sla_config.response_time_minutes)
    resolution_due = created_at + timedelta(minutes=sla_config.resolution_time_minutes)
    return response_due, resolution_due


def apply_sla_to_conversation(db: Session, conversation: Conversation) -> None:
    """Apply SLA configuration to a conversation and set due dates."""
    sla_config = conversation.sla_config or get_default_sla_config(db) or get_active_sla_config(db)
    
    if sla_config:
        conversation.sla_config_id = sla_config.id
        response_due, resolution_due = calculate_sla_dates(conversation.created_at, sla_config)
        conversation.sla_response_due_at = response_due
        conversation.sla_resolution_due_at = resolution_due


def check_and_update_sla_status(db: Session, conversation: Conversation) -> None:
    """Check SLA status and update breach flags, create notifications if needed."""
    if not conversation.sla_response_due_at and not conversation.sla_resolution_due_at:
        return

    now = datetime.now(timezone.utc)
    sla_config = conversation.sla_config

    # Check response SLA
    if conversation.sla_response_due_at and not conversation.sla_response_breached:
        if now > conversation.sla_response_due_at:
            conversation.sla_response_breached = True
            if sla_config:
                create_notification(
                    db,
                    user_id=conversation.assigned_agent_id or get_supervisor_id(db),
                    type=NotificationType.SLA_BREACH,
                    priority=NotificationPriority.HIGH,
                    title="SLA Response Breached",
                    message=f"Conversation #{conversation.id} has breached response SLA ({sla_config.response_time_minutes} minutes)",
                    reference_type="conversation",
                    reference_id=conversation.id,
                )
        elif now > conversation.sla_response_due_at - timedelta(minutes=15):
            # Warning: 15 minutes before breach
            if sla_config:
                create_notification(
                    db,
                    user_id=conversation.assigned_agent_id or get_supervisor_id(db),
                    type=NotificationType.SLA_WARNING,
                    priority=NotificationPriority.NORMAL,
                    title="SLA Response Warning",
                    message=f"Conversation #{conversation.id} response SLA due in 15 minutes",
                    reference_type="conversation",
                    reference_id=conversation.id,
                )

    # Check resolution SLA
    if conversation.sla_resolution_due_at and not conversation.sla_resolution_breached:
        if now > conversation.sla_resolution_due_at:
            conversation.sla_resolution_breached = True
            if sla_config:
                create_notification(
                    db,
                    user_id=conversation.assigned_agent_id or get_supervisor_id(db),
                    type=NotificationType.SLA_BREACH,
                    priority=NotificationPriority.HIGH,
                    title="SLA Resolution Breached",
                    message=f"Conversation #{conversation.id} has breached resolution SLA ({sla_config.resolution_time_minutes} minutes)",
                    reference_type="conversation",
                    reference_id=conversation.id,
                )
        elif now > conversation.sla_resolution_due_at - timedelta(minutes=30):
            # Warning: 30 minutes before breach
            if sla_config:
                create_notification(
                    db,
                    user_id=conversation.assigned_agent_id or get_supervisor_id(db),
                    type=NotificationType.SLA_WARNING,
                    priority=NotificationPriority.NORMAL,
                    title="SLA Resolution Warning",
                    message=f"Conversation #{conversation.id} resolution SLA due in 30 minutes",
                    reference_type="conversation",
                    reference_id=conversation.id,
                )


def record_first_response(db: Session, conversation: Conversation) -> None:
    """Record the first agent response time."""
    if not conversation.first_response_at:
        conversation.first_response_at = datetime.utcnow()


def record_resolution(db: Session, conversation: Conversation) -> None:
    """Record the resolution time."""
    if not conversation.resolved_at:
        conversation.resolved_at = datetime.utcnow()


def get_supervisor_id(db: Session) -> Optional[int]:
    """Get an admin/supervisor user ID for SLA notifications."""
    admin = db.query(User).filter(User.role == "admin", User.is_active == True).first()
    return admin.id if admin else None


def get_sla_status(conversation: Conversation) -> dict:
    """Get current SLA status for a conversation."""
    if not conversation.sla_response_due_at and not conversation.sla_resolution_due_at:
        return {
            "response_status": "not_applicable",
            "resolution_status": "not_applicable",
            "response_remaining_minutes": None,
            "resolution_remaining_minutes": None,
        }

    now = datetime.now(timezone.utc)
    sla_config = conversation.sla_config

    # Response status
    if conversation.first_response_at:
        response_status = "met"
        response_remaining = None
    elif conversation.sla_response_due_at:
        if now > conversation.sla_response_due_at:
            response_status = "breached"
            response_remaining = 0
        else:
            remaining = int((conversation.sla_response_due_at - now).total_seconds() / 60)
            response_remaining = max(0, remaining)
            if remaining <= 15:
                response_status = "warning"
            else:
                response_status = "ok"
    else:
        response_status = "not_applicable"
        response_remaining = None

    # Resolution status
    if conversation.resolved_at:
        resolution_status = "met"
        resolution_remaining = None
    elif conversation.sla_resolution_due_at:
        if now > conversation.sla_resolution_due_at:
            resolution_status = "breached"
            resolution_remaining = 0
        else:
            remaining = int((conversation.sla_resolution_due_at - now).total_seconds() / 60)
            resolution_remaining = max(0, remaining)
            if remaining <= 30:
                resolution_status = "warning"
            else:
                resolution_status = "ok"
    else:
        resolution_status = "not_applicable"
        resolution_remaining = None

    return {
        "response_status": response_status,
        "resolution_status": resolution_status,
        "response_remaining_minutes": response_remaining,
        "resolution_remaining_minutes": resolution_remaining,
    }


def check_all_conversations_sla(db: Session) -> int:
    """Check SLA for all active conversations. Returns number of breaches found."""
    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.status.in_([
                ConversationStatus.AI_HANDLING,
                ConversationStatus.PENDING,
                ConversationStatus.ASSIGNED,
            ])
        )
        .all()
    )

    breach_count = 0
    for conversation in conversations:
        check_and_update_sla_status(db, conversation)
        if conversation.sla_response_breached or conversation.sla_resolution_breached:
            breach_count += 1

    db.commit()
    return breach_count