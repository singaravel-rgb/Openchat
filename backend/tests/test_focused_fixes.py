import io
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app.models  # noqa: F401
from app.db.base import Base
from app.models.user import User
from app.models.conversation import Conversation, SLAConfig
from app.models.knowledge import Article, FAQ
from app.core.enums import ConversationStatus
from app.services.report_service import get_agent_performance, get_time_series, get_knowledge_base_metrics, export_report


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Create dummy admin & agents
    admin = User(email="admin@test.com", full_name="Admin User", role="admin", is_active=True, password_hash="hash")
    agent1 = User(email="agent1@test.com", full_name="Alice Agent", role="agent", is_active=True, password_hash="hash")
    agent2 = User(email="agent2@test.com", full_name="Bob Agent", role="agent", is_active=True, password_hash="hash")
    customer = User(email="customer@test.com", full_name="Charlie Customer", role="customer", is_active=True, password_hash="hash")
    session.add_all([admin, agent1, agent2, customer])
    session.commit()

    # Create conversations across states
    now = datetime.now(timezone.utc)
    conv1 = Conversation(chat_id="CHT-1001", customer_id=customer.id, status=ConversationStatus.AI_HANDLING, created_at=now)
    conv2 = Conversation(chat_id="CHT-1002", customer_id=customer.id, status=ConversationStatus.OPEN, assigned_agent_id=agent1.id, created_at=now)
    conv3 = Conversation(chat_id="CHT-1003", customer_id=customer.id, status=ConversationStatus.PENDING, assigned_agent_id=agent1.id, created_at=now)
    conv4 = Conversation(chat_id="CHT-1004", customer_id=customer.id, status=ConversationStatus.OPEN, assigned_agent_id=None, created_at=now)
    conv5 = Conversation(chat_id="CHT-1005", customer_id=customer.id, status=ConversationStatus.RESOLVED, assigned_agent_id=agent2.id, created_at=now - timedelta(hours=2), resolved_at=now)
    conv6 = Conversation(chat_id="CHT-1006", customer_id=customer.id, status=ConversationStatus.CLOSED, assigned_agent_id=agent2.id, created_at=now - timedelta(hours=3), resolved_at=now - timedelta(hours=1))

    session.add_all([conv1, conv2, conv3, conv4, conv5, conv6])

    # Knowledge base articles & faqs
    art1 = Article(title="Setup Guide", slug="setup-guide", content="Help text", author_id=admin.id, status="published", view_count=42)
    art2 = Article(title="Draft Article", slug="draft-art", content="Draft", author_id=admin.id, status="draft", view_count=5)
    faq1 = FAQ(question="How to reset password?", answer="Click forgot", is_published=True, view_count=19)
    session.add_all([art1, art2, faq1])

    session.commit()

    yield session
    session.close()


from app.models.message import Message, MessageSenderType, MessageType
from app.services.conversation_service import (
    get_unread_customer_message_condition,
    mark_conversation_read_for_user,
    reopen_conversation,
    resolve_conversation,
    transition_status,
)


def test_open_and_pending_metrics_and_lifecycle(db_session):
    """Verify that Open and Pending adhere strictly to the updated status definitions."""
    from sqlalchemy import exists, and_

    base_unmerged = Conversation.merged_into_id.is_(None)
    resolved_statuses = [ConversationStatus.RESOLVED, ConversationStatus.CLOSED, ConversationStatus.MERGED]
    unresolved_cond = and_(base_unmerged, Conversation.status.notin_(resolved_statuses))

    admin = db_session.query(User).filter(User.role == "admin").first()
    customer = db_session.query(User).filter(User.role == "customer").first()
    now = datetime.now(timezone.utc)

    # Initially conv4 is unresolved with no messages. Let's add an unread customer message to conv4
    msg1 = Message(
        conversation_id=4,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        content="Need help please",
        is_internal=False,
        created_at=now,
    )
    db_session.add(msg1)
    db_session.commit()

    has_unread = exists().where(get_unread_customer_message_condition())

    # 1. Open count: must count active unresolved conversations with unread customer messages
    open_count = db_session.query(Conversation).filter(unresolved_cond, has_unread).count()
    assert open_count == 1

    # 2. Once the relevant message is read, remove the conversation from the Open count
    conv4 = db_session.query(Conversation).filter(Conversation.id == 4).first()
    mark_conversation_read_for_user(db_session, conv4.id, admin)
    open_count_after_read = db_session.query(Conversation).filter(unresolved_cond, has_unread).count()
    assert open_count_after_read == 0

    # 3. New customer message arrives -> immediately Open count increments
    now_later = now + timedelta(minutes=5)
    msg2 = Message(
        conversation_id=4,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        content="Any updates?",
        is_internal=False,
        created_at=now_later,
    )
    db_session.add(msg2)
    db_session.commit()
    open_count_new_msg = db_session.query(Conversation).filter(unresolved_cond, has_unread).count()
    assert open_count_new_msg == 1

    # 4. Resolved and closed conversations must never count as Open
    resolve_conversation(db_session, conv4, admin)
    db_session.commit()
    open_count_resolved = db_session.query(Conversation).filter(unresolved_cond, has_unread).count()
    assert open_count_resolved == 0

    # 5. Reopened conversation immediately returns to active/unresolved
    reopen_conversation(db_session, conv4, admin)
    db_session.commit()
    assert conv4.status == ConversationStatus.OPEN
    open_count_reopened = db_session.query(Conversation).filter(unresolved_cond, has_unread).count()
    assert open_count_reopened == 1

    # 6. Pending is a status manually set by an agent and remains until changed
    conv3 = db_session.query(Conversation).filter(Conversation.id == 3).first()
    assert conv3.status == ConversationStatus.PENDING
    pending_count = db_session.query(Conversation).filter(unresolved_cond, Conversation.status == ConversationStatus.PENDING).count()
    assert pending_count == 1

    # Changing status away from Pending
    transition_status(db_session, conv3, ConversationStatus.OPEN.value, admin)
    db_session.commit()
    pending_count_after = db_session.query(Conversation).filter(unresolved_cond, Conversation.status == ConversationStatus.PENDING).count()
    assert pending_count_after == 0


def test_reports_agent_performance_and_knowledge(db_session):
    """Verify agent performance metrics and knowledge base metrics return expected data."""
    perf = get_agent_performance(db_session)
    assert len(perf) == 2  # Alice and Bob
    alice = next(a for a in perf if a["agent_name"] == "Alice Agent")
    assert alice["assigned_count"] == 2  # conv2, conv3
    assert "conversations_handled" in alice
    assert "avg_resolution_hours" in alice

    kb = get_knowledge_base_metrics(db_session)
    assert kb["articles"]["total"] == 2
    assert kb["articles"]["published"] == 1
    assert kb["articles"]["draft"] == 1
    assert kb["faqs"]["total"] == 1
    assert len(kb["top_articles"]) == 2
    assert kb["top_articles"][0]["views"] == 42


def test_reports_export_formats(db_session):
    """Verify export_report works for conversations, agents, and timeseries without errors."""
    # 1. Conversations CSV
    content, filename, media_type = export_report(db_session, "conversations", "csv")
    assert "text/csv" in media_type
    assert "Chat ID" in content
    assert "CHT-1001" in content

    # 2. Agents CSV
    content, filename, media_type = export_report(db_session, "agents", "csv")
    assert "text/csv" in media_type
    assert "Alice Agent" in content

    # 3. Trends/Timeseries CSV
    content, filename, media_type = export_report(db_session, "timeseries", "csv")
    assert "text/csv" in media_type
    assert "Date,Created,Resolved,Avg Resolution (hrs)" in content
