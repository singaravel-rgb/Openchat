import sys
from pathlib import Path
from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db.base import Base
from app.models.user import User
from app.models.conversation import Conversation, ConversationStatus, ConversationUserRead
from app.models.message import Message, MessageSenderType, MessageType
from app.models.notification import Notification, NotificationType
from app.models.attachment import Attachment
from app.services.conversation_service import (
    compute_unread_count,
    mark_conversation_read_for_user,
    build_conversation_list_item,
)


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def test_dashboard_mutually_exclusive_partition(test_db):
    """Verify AI Handling + Human Handling + Pending == Total Unresolved with 0 overlaps and 0 omissions."""
    db = test_db

    # Create customer and agents
    cust = User(email="cust1@example.com", full_name="Customer One", role="customer", is_active=True, password_hash="x")
    ag1 = User(email="ag1@example.com", full_name="Agent One", role="agent", is_active=True, password_hash="x")
    ag2 = User(email="ag2@example.com", full_name="Agent Two", role="agent", is_active=True, password_hash="x")
    db.add_all([cust, ag1, ag2])
    db.commit()

    # 1. AI Handling conversation (unassigned, status=ai_handling)
    c1 = Conversation(customer_id=cust.id, subject="AI Chat", status=ConversationStatus.AI_HANDLING, assigned_agent_id=None)
    # 2. Human Handling conversation (assigned to ag1, status=open)
    c2 = Conversation(customer_id=cust.id, subject="Human Open", status=ConversationStatus.OPEN, assigned_agent_id=ag1.id)
    # 3. Human Handling conversation (assigned to ag2, status=waiting_on_customer)
    c3 = Conversation(customer_id=cust.id, subject="Human Waiting", status=ConversationStatus.WAITING_ON_CUSTOMER, assigned_agent_id=ag2.id)
    # 4. Pending conversation (unassigned, status=pending)
    c4 = Conversation(customer_id=cust.id, subject="Pending Help", status=ConversationStatus.PENDING, assigned_agent_id=None)
    # 5. Pending conversation (unassigned, status=open)
    c5 = Conversation(customer_id=cust.id, subject="Unassigned Open", status=ConversationStatus.OPEN, assigned_agent_id=None)
    # 6. Resolved conversation
    c6 = Conversation(customer_id=cust.id, subject="Resolved Chat", status=ConversationStatus.RESOLVED, assigned_agent_id=ag1.id)
    # 7. Closed conversation
    c7 = Conversation(customer_id=cust.id, subject="Closed Chat", status=ConversationStatus.CLOSED, assigned_agent_id=None)
    # 8. Merged child conversation (must be excluded from active counts)
    c8 = Conversation(customer_id=cust.id, subject="Merged Child", status=ConversationStatus.MERGED, merged_into_id=c2.id)

    db.add_all([c1, c2, c3, c4, c5, c6, c7, c8])
    db.commit()

    # Emulate the get_admin_stats query
    from sqlalchemy import and_
    base_unmerged = Conversation.merged_into_id.is_(None)
    resolved_statuses = [ConversationStatus.RESOLVED, ConversationStatus.CLOSED, ConversationStatus.MERGED]
    unresolved_cond = and_(base_unmerged, Conversation.status.notin_(resolved_statuses))

    total_unresolved = db.query(Conversation).filter(unresolved_cond).count()

    ai_handling = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.assigned_agent_id.is_(None), Conversation.status == ConversationStatus.AI_HANDLING)
        .count()
    )
    human_handled = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.assigned_agent_id.isnot(None))
        .count()
    )
    pending = (
        db.query(Conversation)
        .filter(unresolved_cond, Conversation.assigned_agent_id.is_(None), Conversation.status != ConversationStatus.AI_HANDLING)
        .count()
    )
    resolved = (
        db.query(Conversation)
        .filter(base_unmerged, Conversation.status.in_([ConversationStatus.RESOLVED, ConversationStatus.CLOSED]))
        .count()
    )

    # c1 is AI Handling -> 1
    assert ai_handling == 1
    # c2 and c3 are Human Handled -> 2
    assert human_handled == 2
    # c4 and c5 are Pending -> 2
    assert pending == 2
    # c6 and c7 are Resolved -> 2
    assert resolved == 2

    # CRITICAL IDENTITY: AI Handling + Human Handling + Pending == Total Unresolved
    assert ai_handling + human_handled + pending == total_unresolved
    assert total_unresolved == 5


def test_per_user_independent_unread_tracking(test_db):
    """Verify that Agent 1 reading does NOT clear Agent 2's unread count, and customer read state is independent."""
    db = test_db

    cust = User(email="cust_u@example.com", full_name="Customer U", role="customer", is_active=True, password_hash="x")
    ag1 = User(email="ag1_u@example.com", full_name="Agent 1", role="agent", is_active=True, password_hash="x")
    ag2 = User(email="ag2_u@example.com", full_name="Agent 2", role="agent", is_active=True, password_hash="x")
    db.add_all([cust, ag1, ag2])
    db.commit()

    conv = Conversation(customer_id=cust.id, subject="Multi-Agent Chat", status=ConversationStatus.OPEN, assigned_agent_id=ag1.id)
    db.add(conv)
    db.commit()

    # Customer sends 3 messages
    m1 = Message(conversation_id=conv.id, sender_id=cust.id, sender_type=MessageSenderType.CUSTOMER, message_type=MessageType.TEXT, content="Hello 1", is_internal=False)
    m2 = Message(conversation_id=conv.id, sender_id=cust.id, sender_type=MessageSenderType.CUSTOMER, message_type=MessageType.TEXT, content="Hello 2", is_internal=False)
    m3 = Message(conversation_id=conv.id, sender_id=cust.id, sender_type=MessageSenderType.CUSTOMER, message_type=MessageType.TEXT, content="Hello 3", is_internal=False)
    db.add_all([m1, m2, m3])
    db.commit()

    # Initially, both agents have 3 unread messages
    unread_ag1 = compute_unread_count(db, conv, viewer=ag1)
    unread_ag2 = compute_unread_count(db, conv, viewer=ag2)
    assert unread_ag1 == 3
    assert unread_ag2 == 3

    # Customer has 0 unread messages (they sent all 3)
    unread_cust = compute_unread_count(db, conv, viewer=cust)
    assert unread_cust == 0

    # Agent 1 opens and marks conversation as read
    res1 = mark_conversation_read_for_user(db, conv.id, ag1, last_message_id=m3.id)
    assert res1["last_read_message_id"] == m3.id

    # Agent 1 now has 0 unread
    assert compute_unread_count(db, conv, viewer=ag1) == 0

    # Agent 2 MUST STILL HAVE 3 unread! (No cross-agent unread bleeding)
    assert compute_unread_count(db, conv, viewer=ag2) == 3

    # Agent 1 sends a reply
    m4 = Message(conversation_id=conv.id, sender_id=ag1.id, sender_type=MessageSenderType.AGENT, message_type=MessageType.TEXT, content="Agent 1 here", is_internal=False)
    db.add(m4)
    db.commit()

    # Customer now has 1 unread message
    assert compute_unread_count(db, conv, viewer=cust) == 1
    # Agent 1 still has 0 (they authored m4)
    assert compute_unread_count(db, conv, viewer=ag1) == 0
    # Agent 2 now has 4 unread messages
    assert compute_unread_count(db, conv, viewer=ag2) == 4

    # Customer marks conversation read
    mark_conversation_read_for_user(db, conv.id, cust, last_message_id=m4.id)
    assert compute_unread_count(db, conv, viewer=cust) == 0

    # Agent 2 still has 4 unread messages
    assert compute_unread_count(db, conv, viewer=ag2) == 4


def test_unicode_emoji_persistence(test_db):
    """Verify that multi-character Unicode emojis persist and retrieve without corruption."""
    db = test_db

    cust = User(email="cust_e@example.com", full_name="Customer Emoji", role="customer", is_active=True, password_hash="x")
    db.add(cust)
    db.commit()

    conv = Conversation(customer_id=cust.id, subject="Emoji Support 😀🚀", status=ConversationStatus.OPEN)
    db.add(conv)
    db.commit()

    emoji_text = "Hello! 👋 I have a question about my order 📦💳. Thank you so much! 🙏❤️✨"
    msg = Message(
        conversation_id=conv.id,
        sender_id=cust.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content=emoji_text,
        is_internal=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    fetched = db.query(Message).filter(Message.id == msg.id).first()
    assert fetched is not None
    assert fetched.content == emoji_text
    assert "👋" in fetched.content
    assert "📦" in fetched.content
    assert "🙏" in fetched.content
    assert "❤️" in fetched.content


def test_private_note_notification_isolation(test_db):
    """Verify private note creates notification for assigned agent without exposing to customer."""
    db = test_db

    cust = User(email="cust_p@example.com", full_name="Customer P", role="customer", is_active=True, password_hash="x")
    ag1 = User(email="author@example.com", full_name="Author Agent", role="agent", is_active=True, password_hash="x")
    ag2 = User(email="assignee@example.com", full_name="Assignee Agent", role="agent", is_active=True, password_hash="x")
    db.add_all([cust, ag1, ag2])
    db.commit()

    conv = Conversation(customer_id=cust.id, subject="Private Note Chat", status=ConversationStatus.ASSIGNED, assigned_agent_id=ag2.id)
    db.add(conv)
    db.commit()

    # Note created by ag1 on conv assigned to ag2
    note_content = "Customer requested account reset. Please handle @Assignee"
    note_msg = Message(
        conversation_id=conv.id,
        sender_id=ag1.id,
        sender_type=MessageSenderType.AGENT,
        message_type=MessageType.INTERNAL_NOTE,
        content=note_content,
        is_internal=True,
    )
    db.add(note_msg)

    # Emulate the notification logic from agent.py
    if conv.assigned_agent_id and conv.assigned_agent_id != ag1.id:
        notif = Notification(
            user_id=conv.assigned_agent_id,
            type=NotificationType.NEW_MESSAGE,
            title=f"New private note in Chat #{conv.id}",
            message=f"{ag1.full_name}: {note_content[:120]}",
            reference_type="conversation",
            reference_id=conv.id,
        )
        db.add(notif)
    db.commit()

    # Check that Assignee Agent received notification
    assignee_notifs = db.query(Notification).filter(Notification.user_id == ag2.id).all()
    assert len(assignee_notifs) == 1
    assert "New private note" in assignee_notifs[0].title
    assert "Author Agent" in assignee_notifs[0].message

    # Check that Customer received ZERO notifications
    cust_notifs = db.query(Notification).filter(Notification.user_id == cust.id).all()
    assert len(cust_notifs) == 0
