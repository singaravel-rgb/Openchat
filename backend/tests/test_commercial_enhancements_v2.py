import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app.models  # noqa: F401
from app.core.enums import ConversationStatus, MessageSenderType
from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.models.agent_profile import AgentProfile
from app.models.business_hours import BusinessHours, Holiday
from app.models.canned_response import CannedResponse
from app.models.conversation import Conversation
from app.models.notification import NotificationPriority, NotificationType
from app.models.setting import Setting
from app.models.tag import Tag
from app.models.user import User
from app.services.assignment_service import (
    assign_conversation_to_agent,
    get_available_agents,
    process_pending_queue,
    set_agent_availability,
)
from app.services.business_hours_service import get_business_hours_status
from app.services.conversation_service import (
    add_message,
    check_and_bump_version,
    list_conversations_query,
    take_conversation,
    update_conversation_properties,
)
from app.services.notification_service import create_notification


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    admin = User(email="admin@test.com", full_name="Admin", role="admin", is_active=True, password_hash=hash_password("Pass1234!"))
    super_admin = User(email="super@test.com", full_name="Super Admin", role="super_admin", is_active=True, password_hash=hash_password("Pass1234!"))
    agent1 = User(email="agent1@test.com", full_name="Agent One", role="agent", is_active=True, password_hash=hash_password("Pass1234!"))
    agent2 = User(email="agent2@test.com", full_name="Agent Two", role="agent", is_active=True, password_hash=hash_password("Pass1234!"))
    customer = User(email="cust@test.com", full_name="Customer One", role="customer", is_active=True, password_hash=hash_password("Pass1234!"))
    session.add_all([admin, super_admin, agent1, agent2, customer])
    session.flush()

    session.add_all([
        AgentProfile(user_id=agent1.id, is_available=True, is_approved=True, availability_status="available", max_conversations=5),
        AgentProfile(user_id=agent2.id, is_available=True, is_approved=True, availability_status="available", max_conversations=5),
    ])
    session.commit()
    yield session
    session.close()


def test_agent_availability_3state_and_admin_lock(db_session):
    agent1 = db_session.query(User).filter(User.email == "agent1@test.com").first()
    agent2 = db_session.query(User).filter(User.email == "agent2@test.com").first()

    # Busy pauses auto-assignment without logging out
    set_agent_availability(db_session, agent1.id, availability_status="busy", pause_auto_assignment=True, by_admin=False)
    avail = get_available_agents(db_session)
    assert all(a.id != agent1.id for a in avail)
    assert any(a.id == agent2.id for a in avail)

    # Admin forces agent1 offline -> agent1 cannot override
    set_agent_availability(db_session, agent1.id, availability_status="offline", by_admin=True)
    with pytest.raises(HTTPException) as exc:
        set_agent_availability(db_session, agent1.id, availability_status="available", by_admin=False)
    assert exc.value.status_code == 403

    # Admin unlocks agent1 -> becomes available and processes queue
    customer = db_session.query(User).filter(User.role == "customer").first()
    c_open = Conversation(chat_id="OC-2026-9001", customer_id=customer.id, status=ConversationStatus.OPEN)
    db_session.add(c_open)
    db_session.commit()

    set_agent_availability(db_session, agent2.id, availability_status="offline", by_admin=True)
    set_agent_availability(db_session, agent1.id, availability_status="available", by_admin=True)
    db_session.refresh(c_open)
    assert c_open.assigned_agent_id == agent1.id


def test_priority_tags_filter_and_sort(db_session):
    admin = db_session.query(User).filter(User.role == "admin").first()
    customer = db_session.query(User).filter(User.role == "customer").first()

    t1 = Tag(name="Payment", color="#10b981", is_active=True, created_by_id=admin.id)
    t2 = Tag(name="Refund", color="#f59e0b", is_active=True, created_by_id=admin.id)
    db_session.add_all([t1, t2])
    db_session.flush()

    c1 = Conversation(chat_id="OC-1", customer_id=customer.id, status=ConversationStatus.OPEN, priority="low", tags=["Payment"])
    c2 = Conversation(chat_id="OC-2", customer_id=customer.id, status=ConversationStatus.OPEN, priority="urgent", tags=["Refund"])
    db_session.add_all([c1, c2])
    db_session.commit()

    items_prio, total = list_conversations_query(db_session, viewer=admin, priority="urgent")
    assert total == 1 and items_prio[0].chat_id == "OC-2"

    items_tag, total_tag = list_conversations_query(db_session, viewer=admin, tag="Payment")
    assert total_tag == 1 and items_tag[0].chat_id == "OC-1"

    items_sorted, _ = list_conversations_query(db_session, viewer=admin, sort_by="priority_desc")
    assert [i.chat_id for i in items_sorted] == ["OC-2", "OC-1"]


def test_concurrency_optimistic_lock_and_take_ownership(db_session):
    agent1 = db_session.query(User).filter(User.email == "agent1@test.com").first()
    agent2 = db_session.query(User).filter(User.email == "agent2@test.com").first()
    customer = db_session.query(User).filter(User.role == "customer").first()

    conv = Conversation(chat_id="OC-LOCK-1", customer_id=customer.id, status=ConversationStatus.OPEN, version=1)
    db_session.add(conv)
    db_session.commit()

    # Agent 1 takes conversation with version=1
    take_conversation(db_session, conv, agent1, expected_version=1)
    db_session.commit()
    assert conv.assigned_agent_id == agent1.id
    assert conv.version >= 2

    # Agent 2 tries with stale expected_version=1 -> 409 Conflict
    with pytest.raises(HTTPException) as exc1:
        check_and_bump_version(conv, expected_version=1)
    assert exc1.value.status_code == 409

    # Agent 2 tries to take already-owned conversation -> 409 Conflict
    with pytest.raises(HTTPException) as exc2:
        take_conversation(db_session, conv, agent2)
    assert exc2.value.status_code == 409


def test_notifications_dedup_preferences_and_honest_email(db_session):
    agent1 = db_session.query(User).filter(User.email == "agent1@test.com").first()
    agent1.notification_preferences = {"in_app_assigned": True, "email_assigned": True}
    db_session.commit()

    n1 = create_notification(
        db_session,
        user_id=agent1.id,
        type=NotificationType.CONVERSATION_ASSIGNED,
        title="Assigned",
        message="Ticket #1",
        reference_type="conversation",
        reference_id=1,
        dedup_key="assign:1:agent1",
    )
    n2 = create_notification(
        db_session,
        user_id=agent1.id,
        type=NotificationType.CONVERSATION_ASSIGNED,
        title="Assigned",
        message="Ticket #1",
        reference_type="conversation",
        reference_id=1,
        dedup_key="assign:1:agent1",
    )
    assert n1 is not None and n2 is not None
    assert n1.id == n2.id  # Deduplicated!
    assert n1.email_sent is False
    assert n1.email_status == "skipped_unconfigured"  # Honest status when SMTP is not configured


def test_business_hours_timezone_and_holiday(db_session):
    now_utc = datetime.now(timezone.utc)
    db_session.add(Setting(category="business_hours", key="timezone", value="UTC"))
    db_session.add(Setting(category="business_hours", key="out_of_hours_message", value="Closed now!"))
    db_session.add(BusinessHours(day_of_week=now_utc.weekday(), start_time=time(0, 0), end_time=time(23, 59, 59), is_closed=False, is_active=True))
    db_session.commit()

    st_open = get_business_hours_status(db_session)
    assert st_open["is_open"] is True
    assert st_open["out_of_hours_message"] == "Closed now!"

    # Add holiday for today -> closed
    db_session.add(Holiday(name="Test Holiday", holiday_date=now_utc.date(), is_recurring=False, is_active=True))
    db_session.commit()
    st_hol = get_business_hours_status(db_session)
    assert st_hol["is_open"] is False
    assert "Holiday" in st_hol["reason"]


def test_business_hours_settings_no_timezone_collision(db_session):
    from app.api.v1.admin_settings import bulk_update_settings, get_settings
    from app.schemas.setting import SettingsBulkUpdate

    admin = db_session.query(User).filter(User.role == "admin").first()

    # Initialize general settings first (which creates key="timezone")
    gen = get_settings("general", db=db_session, current_user=admin)
    gen_tz = next(s for s in gen if s.key == "timezone")
    assert gen_tz.value == "UTC"

    # Repeated GET on business_hours must succeed with no IntegrityError
    bh1 = get_settings("business_hours", db=db_session, current_user=admin)
    bh2 = get_settings("business_hours", db=db_session, current_user=admin)
    assert any(s.key == "business_hours_timezone" for s in bh1)
    assert any(s.key == "business_hours_timezone" for s in bh2)

    # Update business_hours_timezone and verify general.timezone is untouched
    bulk_update_settings(
        "business_hours",
        SettingsBulkUpdate(settings={"business_hours_timezone": "Asia/Kolkata", "out_of_hours_message": "Away"}),
        db=db_session,
        current_user=admin,
    )
    gen_after = get_settings("general", db=db_session, current_user=admin)
    assert next(s for s in gen_after if s.key == "timezone").value == "UTC"
    bh_cfg = get_business_hours_status(db_session)
    assert bh_cfg["timezone"] == "Asia/Kolkata"
    assert bh_cfg["out_of_hours_message"] == "Away"


def test_agent_deactivation_reassigns_active_conversations(db_session):
    from app.api.v1.admin_users import update_user
    from app.schemas.user_management import UserUpdateRequest

    admin = db_session.query(User).filter(User.role == "admin").first()
    agent1 = db_session.query(User).filter(User.email == "agent1@test.com").first()
    agent2 = db_session.query(User).filter(User.email == "agent2@test.com").first()
    customer = db_session.query(User).filter(User.role == "customer").first()

    conv = Conversation(
        chat_id="OC-DEACT-1",
        customer_id=customer.id,
        assigned_agent_id=agent1.id,
        status=ConversationStatus.ASSIGNED,
    )
    db_session.add(conv)
    db_session.commit()

    # Deactivate agent1 -> active conversation safely reassigned to agent2
    update_user(agent1.id, UserUpdateRequest(is_active=False), db=db_session, current_user=admin)
    db_session.refresh(agent1)
    db_session.refresh(conv)
    assert agent1.is_active is False
    assert conv.assigned_agent_id == agent2.id
    assert all(a.id != agent1.id for a in get_available_agents(db_session))

    # Reactivate agent1
    update_user(agent1.id, UserUpdateRequest(is_active=True), db=db_session, current_user=admin)
    db_session.refresh(agent1)
    assert agent1.is_active is True
