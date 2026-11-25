from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, and_, or_, exists
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.core.enums import ConversationStatus, MessageSenderType, MessageType
from app.core.security import hash_password
from app.db.session import get_db
from app.models.agent_profile import AgentProfile
from app.models.audit_log import AuditLog
from app.models.csat import CSATRating
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.schemas.conversation import (
    ConversationListItem,
    ConversationDetail,
    ConversationUpdate,
    GlobalNoteUpdate,
    AssignRequest,
    StatusUpdateRequest,
    MessageCreate,
    MessageResponse,
    ConversationLinkItem,
)
from app.schemas.auth import UserCreate, AdminAgentCreate
from app.services.conversation_service import (
    build_conversation_list_item,
    list_conversations_query,
    ensure_can_view,
    update_conversation_properties,
    assign_conversation as svc_assign,
    transition_status,
    close_conversation as svc_close,
    reopen_conversation as svc_reopen,
    resolve_conversation as svc_resolve,
    mark_conversation_read,
    update_global_note,
    get_linked_conversations_for_conversation,
    delete_conversation as svc_delete_conversation,
)
from app.services.sla_service import record_first_response

router = APIRouter(prefix="/admin", tags=["Admin Workspace"])


def require_admin(current_user: User = Depends(require_roles("admin", "super_admin"))) -> User:
    return current_user


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    base_unmerged = Conversation.merged_into_id.is_(None)
    resolved_statuses = [ConversationStatus.RESOLVED, ConversationStatus.CLOSED, ConversationStatus.MERGED]

    total_conversations = db.query(Conversation).filter(base_unmerged).count()

    # Active/unresolved condition: unmerged and not resolved/closed/merged
    unresolved_cond = and_(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses),
    )
    all_unresolved = db.query(Conversation).filter(unresolved_cond).count()
    total_unresolved = all_unresolved

    # 1. AI Handling: unresolved, unassigned, status == ai_handling
    ai_handling_conversations = (
        db.query(Conversation)
        .filter(
            unresolved_cond,
            Conversation.assigned_agent_id.is_(None),
            Conversation.status == ConversationStatus.AI_HANDLING,
        )
        .count()
    )

    # 2. Human Handling: unresolved, assigned to human agent, not in pending status
    human_handling_conversations = (
        db.query(Conversation)
        .filter(
            unresolved_cond,
            Conversation.assigned_agent_id.isnot(None),
            Conversation.status != ConversationStatus.PENDING,
        )
        .count()
    )
    human_handled_conversations = human_handling_conversations

    # 3. Pending: status manually set by agent
    pending_conversations = (
        db.query(Conversation)
        .filter(
            unresolved_cond,
            Conversation.status == ConversationStatus.PENDING,
        )
        .count()
    )

    # 4. Open: active, unresolved conversation with an unread customer message requiring attention/response
    from app.services.conversation_service import get_unread_customer_message_condition
    has_unread_customer_msg = exists().where(get_unread_customer_message_condition())

    open_conversations = (
        db.query(Conversation)
        .filter(
            unresolved_cond,
            has_unread_customer_msg,
        )
        .count()
    )

    # Partition 5: Resolved (unmerged, status in (resolved, closed))
    resolved_conversations = (
        db.query(Conversation)
        .filter(
            base_unmerged,
            Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]),
        )
        .count()
    )
    closed_conversations = (
        db.query(Conversation)
        .filter(
            base_unmerged,
            Conversation.status == ConversationStatus.CLOSED,
        )
        .count()
    )

    # Secondary breakdowns
    assigned_conversations = human_handled_conversations
    on_hold_conversations = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.status == ConversationStatus.ON_HOLD)
        .count()
    )
    waiting_on_customer_conversations = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.status == ConversationStatus.WAITING_ON_CUSTOMER)
        .count()
    )

    ai_resolved_conversations = (
        db.query(Conversation)
        .filter(
            base_unmerged,
            Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]),
            Conversation.assigned_agent_id.is_(None),
        )
        .count()
    )

    missed_deadlines = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.sla_response_breached == True)  # noqa: E712
        .count()
    )
    escalation_rate = round((human_handled_conversations / total_conversations * 100), 1) if total_conversations > 0 else 0.0

    unassigned_conversations = ai_handling_conversations + pending_conversations
    unanswered_conversations = pending_conversations

    total_agents = db.query(User).filter(User.role == "agent", User.is_active == True).count()  # noqa: E712
    available_agents = (
        db.query(User)
        .join(AgentProfile, User.id == AgentProfile.user_id)
        .filter(User.role == "agent", User.is_active == True, AgentProfile.is_available == True)  # noqa: E712
        .count()
    )

    total_customers = db.query(User).filter(User.role == "customer", User.is_active == True).count()  # noqa: E712

    today = datetime.utcnow().date()
    conversations_today = (
        db.query(Conversation)
        .filter(base_unmerged, func.date(Conversation.created_at) == today)
        .count()
    )

    avg_resolution_time = None
    resolved_convs = (
        db.query(Conversation)
        .filter(base_unmerged, Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]))
        .all()
    )
    if resolved_convs:
        total_hours = sum((c.updated_at - c.created_at).total_seconds() / 3600 for c in resolved_convs)
        avg_resolution_time = round(total_hours / len(resolved_convs), 2)

    return {
        "conversations": {
            "total": total_conversations,
            "all_unresolved": all_unresolved,
            "total_unresolved": all_unresolved,
            "unresolved": all_unresolved,
            "ai_handling": ai_handling_conversations,
            "human_handling": human_handling_conversations,
            "human_handled": human_handling_conversations,
            "pending": pending_conversations,
            "open": open_conversations,
            "ai_resolved": ai_resolved_conversations,
            "escalation_rate": escalation_rate,
            "missed_deadlines": missed_deadlines,
            "unassigned": ai_handling_conversations + open_conversations,
            "unanswered": pending_conversations,
            "assigned": human_handling_conversations,
            "on_hold": on_hold_conversations,
            "waiting_on_customer": waiting_on_customer_conversations,
            "resolved": resolved_conversations,
            "closed": closed_conversations,
            "today": conversations_today,
        },
        "agents": {
            "total": total_agents,
            "available": available_agents,
            "busy": max(0, total_agents - available_agents),
        },
        "customers": {"total": total_customers},
        "avg_resolution_hours": avg_resolution_time,
    }


@router.post("/escalation/check")
def trigger_escalation_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.services.escalation_service import check_response_deadlines_and_escalate
    return check_response_deadlines_and_escalate(db)


@router.get("/agents")
def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agents = db.query(User).filter(User.role == "agent").order_by(User.id.asc()).all()
    result = []
    for agent in agents:
        profile = agent.agent_profile
        active_count = (
            db.query(Conversation)
            .filter(
                Conversation.assigned_agent_id == agent.id,
                Conversation.status.in_([ConversationStatus.ASSIGNED, ConversationStatus.AI_HANDLING]),
            )
            .count()
        )
        eff = "offline" if (not agent.is_active or (profile and profile.admin_forced_offline)) else (profile.availability_status if profile else "offline")
        if eff == "available" and profile and profile.pause_auto_assignment:
            eff = "busy"
        result.append({
            "id": agent.id,
            "email": agent.email,
            "full_name": agent.full_name,
            "is_active": agent.is_active,
            "is_approved": profile.is_approved if profile else False,
            "is_available": (profile.is_available if profile else False) if agent.is_active else False,
            "availability_status": profile.availability_status if profile else "offline",
            "effective_status": eff,
            "admin_forced_offline": profile.admin_forced_offline if profile else False,
            "pause_auto_assignment": profile.pause_auto_assignment if profile else False,
            "max_conversations": profile.max_conversations if profile else 5,
            "active_conversations": active_count,
            "capacity_remaining": max(0, (profile.max_conversations if profile else 5) - active_count),
        })
    return result


@router.post("/agents", status_code=201)
def create_agent(
    payload: AdminAgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    new_user = User(
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role="agent",
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    new_profile = AgentProfile(
        user_id=new_user.id,
        is_approved=True,
        is_available=payload.is_available,
        max_conversations=payload.max_conversations,
    )
    db.add(new_profile)
    db.commit()
    db.refresh(new_user)

    return {
        "id": new_user.id,
        "email": new_user.email,
        "full_name": new_user.full_name,
        "is_active": new_user.is_active,
        "is_approved": True,
        "is_available": new_profile.is_available,
        "max_conversations": new_profile.max_conversations,
        "active_conversations": 0,
        "capacity_remaining": new_profile.max_conversations,
    }


@router.patch("/agents/{agent_id}/availability")
def set_agent_availability_admin(
    agent_id: int,
    is_available: Optional[bool] = Query(None),
    availability_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agent = db.query(User).filter(User.id == agent_id, User.role == "agent").first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not agent.agent_profile:
        db.add(AgentProfile(user_id=agent.id, is_approved=True))
        db.commit()
    from app.services.assignment_service import set_agent_availability
    profile = set_agent_availability(
        db,
        agent.id,
        is_available=is_available,
        availability_status=availability_status,
        by_admin=True,
    )
    return {
        "message": f"Agent {agent.full_name} availability updated to {profile.availability_status if profile else 'offline'}",
        "availability_status": profile.availability_status if profile else "offline",
        "admin_forced_offline": profile.admin_forced_offline if profile else False,
        "is_available": profile.is_available if profile else False,
    }


@router.patch("/agents/{agent_id}/max-conversations")
def set_agent_max_conversations(
    agent_id: int,
    max_conversations: int = Query(..., ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agent = db.query(User).filter(User.id == agent_id, User.role == "agent").first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    profile = agent.agent_profile
    if not profile:
        profile = AgentProfile(user_id=agent.id, max_conversations=max_conversations)
        db.add(profile)
    else:
        profile.max_conversations = max_conversations
    db.commit()
    return {"message": f"Agent {agent.full_name} max conversations set to {max_conversations}"}


@router.get("/agents/pending")
def list_pending_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agents = (
        db.query(User)
        .join(AgentProfile, User.id == AgentProfile.user_id)
        .filter(User.role == "agent", User.is_active == True, AgentProfile.is_approved == False)  # noqa: E712
        .all()
    )
    result = []
    for agent in agents:
        profile = agent.agent_profile
        result.append({
            "id": agent.id,
            "email": agent.email,
            "full_name": agent.full_name,
            "created_at": agent.created_at.isoformat() if agent.created_at else None,
            "is_available": profile.is_available if profile else False,
            "max_conversations": profile.max_conversations if profile else 5,
        })
    return result


@router.post("/agents/{agent_id}/approve")
def approve_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agent = db.query(User).filter(User.id == agent_id, User.role == "agent").first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    profile = agent.agent_profile
    if not profile:
        profile = AgentProfile(user_id=agent.id, is_approved=True, is_available=True)
        db.add(profile)
    else:
        profile.is_approved = True
    db.commit()
    db.refresh(profile)
    return {
        "message": f"Agent {agent.full_name} approved",
        "agent_id": agent.id,
        "is_approved": profile.is_approved,
    }


@router.post("/agents/{agent_id}/reject")
def reject_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    agent = db.query(User).filter(User.id == agent_id, User.role == "agent").first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_active = False
    profile = agent.agent_profile
    if profile:
        profile.is_approved = False
        profile.is_available = False
    db.commit()
    return {
        "message": f"Agent {agent.full_name} rejected and deactivated",
        "agent_id": agent.id,
        "is_active": agent.is_active,
    }


@router.get("/conversations", response_model=list[ConversationListItem])
def list_all_conversations_admin(
    status_filter: Optional[str] = Query(None, alias="status"),
    agent_id: Optional[int] = Query(None),
    customer_id: Optional[int] = Query(None),
    handling: Optional[str] = Query(None),
    filter_type: Optional[str] = Query(None, alias="filter"),
    priority: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, le=200, ge=1),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    items, _ = list_conversations_query(
        db,
        viewer=current_user,
        status_filter=status_filter,
        agent_id=agent_id,
        customer_id=customer_id,
        handling=handling,
        filter_type=filter_type,
        priority=priority,
        tag=tag,
        sort_by=sort_by,
        q=q,
        limit=limit,
        offset=offset,
    )
    return [build_conversation_list_item(db, c, viewer=current_user) for c in items]


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation_admin(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ensure_can_view(current_user, conversation)

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    mark_conversation_read(db, conversation, "agent")
    db.commit()
    db.refresh(conversation)

    item = build_conversation_list_item(db, conversation, viewer=current_user)

    return ConversationDetail(
        id=conversation.id,
        chat_id=conversation.chat_id,
        customer_id=conversation.customer_id,
        assigned_agent_id=conversation.assigned_agent_id,
        subject=conversation.subject,
        status=conversation.status,
        channel=conversation.channel,
        priority=getattr(conversation, "priority", "normal"),
        tags=getattr(conversation, "tags", []) or [],
        resolution_details=getattr(conversation, "resolution_details", None),
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        resolved_at=getattr(conversation, "resolved_at", None),
        closed_at=getattr(conversation, "closed_at", None),
        customer_last_read_at=getattr(conversation, "customer_last_read_at", None),
        agent_last_read_at=getattr(conversation, "agent_last_read_at", None),
        assignment_history=getattr(conversation, "assignment_history", []) or [],
        global_note=conversation.global_note,
        global_note_updated_at=conversation.global_note_updated_at,
        global_note_updated_by_id=conversation.global_note_updated_by_id,
        global_note_updated_by_name=conversation.global_note_updated_by.full_name if conversation.global_note_updated_by else None,
        messages=[MessageResponse.model_validate(m) for m in messages],
        customer_name=item.get("customer_name"),
        customer_email=item.get("customer_email"),
        assigned_agent_name=item.get("assigned_agent_name"),
        last_message=item.get("last_message"),
        last_message_at=item.get("last_message_at"),
        unread_count=item.get("unread_count", 0),
        merged_into_id=getattr(conversation, "merged_into_id", None),
        version=getattr(conversation, "version", 1) or 1,
        linked_conversations=[
            ConversationLinkItem.model_validate(l)
            for l in get_linked_conversations_for_conversation(db, conversation.id)
        ],
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation_admin(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return svc_delete_conversation(db, conversation, current_user)


@router.patch("/conversations/{conversation_id}/global-note")
def update_global_note_admin(
    conversation_id: int,
    data: GlobalNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    res = update_global_note(db, conversation, data.text, current_user)
    return res


@router.patch("/conversations/{conversation_id}")
def update_conversation_admin(
    conversation_id: int,
    data: ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    update_conversation_properties(
        db,
        conversation,
        current_user,
        subject=data.subject,
        priority=data.priority,
        tags=data.tags,
        expected_version=data.expected_version,
    )
    db.commit()
    db.refresh(conversation)
    return {"message": "Conversation updated"}


@router.post("/conversations/{conversation_id}/assign")
def assign_conversation_admin(
    conversation_id: int,
    data: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_assign(db, conversation, current_user, data.agent_id, note=data.note)
    db.commit()
    return {"message": "Conversation assignment updated"}


@router.post("/conversations/{conversation_id}/status")
def update_conversation_status_admin(
    conversation_id: int,
    data: StatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not data.status:
        raise HTTPException(status_code=400, detail="status is required")

    target_status = data.status.lower()
    if target_status == "open":
        target_status = ConversationStatus.OPEN
    elif target_status == "resolved":
        target_status = ConversationStatus.RESOLVED
    elif target_status == "pending":
        target_status = ConversationStatus.PENDING
    elif target_status == "on_hold":
        target_status = ConversationStatus.ON_HOLD
    elif target_status == "waiting_on_customer":
        target_status = ConversationStatus.WAITING_ON_CUSTOMER

    if target_status == ConversationStatus.RESOLVED:
        svc_resolve(db, conversation, current_user, resolution_details=data.resolution_details)
    elif target_status == ConversationStatus.CLOSED:
        svc_close(db, conversation, current_user, resolution_details=data.resolution_details)
    elif target_status in (
        ConversationStatus.PENDING,
        ConversationStatus.OPEN,
        ConversationStatus.ASSIGNED,
        ConversationStatus.AI_HANDLING,
        ConversationStatus.ON_HOLD,
        ConversationStatus.WAITING_ON_CUSTOMER,
    ):
        if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
            svc_reopen(db, conversation, current_user)
            if target_status != conversation.status:
                transition_status(db, conversation, target_status, current_user)
        else:
            transition_status(db, conversation, target_status, current_user)
    else:
        raise HTTPException(status_code=400, detail="Unsupported status")
    db.commit()
    return {"message": "Conversation status updated"}


@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
def send_admin_message(
    conversation_id: int,
    data: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.status in (ConversationStatus.RESOLVED, ConversationStatus.CLOSED):
        raise HTTPException(status_code=409, detail="This conversation is no longer accepting messages")
    if data.client_message_id:
        existing = db.query(Message).filter(Message.conversation_id == conversation_id, Message.client_message_id == data.client_message_id, Message.sender_id == current_user.id).first()
        if existing:
            return existing
    now = datetime.utcnow()
    msg = Message(
        conversation_id=conversation.id,
        sender_id=current_user.id,
        sender_type=MessageSenderType.AGENT,
        message_type=MessageType.INTERNAL_NOTE if data.is_internal else MessageType.TEXT,
        content=data.content,
        is_internal=data.is_internal,
        delivery_status="delivered",
        processed_at=now,
        client_message_id=data.client_message_id,
    )
    db.add(msg)
    conversation.updated_at = now
    if not data.is_internal:
        record_first_response(db, conversation)
    db.commit()
    db.refresh(msg)
    return msg


@router.post("/conversations/{conversation_id}/resolve")
def resolve_conversation_admin(
    conversation_id: int,
    data: StatusUpdateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_resolve(db, conversation, current_user, resolution_details=(data.resolution_details if data else None))
    db.commit()
    return {"message": "Conversation resolved successfully"}


@router.post("/conversations/{conversation_id}/close")
def close_conversation_admin(
    conversation_id: int,
    data: StatusUpdateRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_close(db, conversation, current_user, resolution_details=(data.resolution_details if data else None))
    db.commit()
    return {"message": "Conversation closed successfully"}


@router.post("/conversations/{conversation_id}/reopen")
def reopen_conversation_admin(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    svc_reopen(db, conversation, current_user)
    db.commit()
    return {"message": "Conversation reopened successfully"}


@router.get("/csat")
def get_csat_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get CSAT metrics: average rating, distribution, total ratings."""
    ratings = db.query(CSATRating).all()
    if not ratings:
        return {
            "average_rating": 0,
            "total_ratings": 0,
            "distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        }

    total = len(ratings)
    avg = sum(r.rating for r in ratings) / total
    distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in ratings:
        distribution[r.rating] += 1

    return {
        "average_rating": round(avg, 2),
        "total_ratings": total,
        "distribution": distribution,
    }


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Get audit logs for admin actions."""
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return result
