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


def test_dashboard_5_metrics_partition(db_session):
    """Verify that the 5 metrics strictly partition unresolved conversations: AI + Human + Pending + Open == All Unresolved."""
    base_unmerged = Conversation.merged_into_id.is_(None)
    resolved_statuses = [ConversationStatus.RESOLVED, ConversationStatus.CLOSED, ConversationStatus.MERGED]
    pending_statuses = [ConversationStatus.PENDING, ConversationStatus.ON_HOLD, ConversationStatus.WAITING_ON_CUSTOMER]

    all_unresolved = db_session.query(Conversation).filter(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses)
    ).count()

    ai_handling = db_session.query(Conversation).filter(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses),
        Conversation.assigned_agent_id.is_(None),
        Conversation.status == ConversationStatus.AI_HANDLING,
    ).count()

    pending = db_session.query(Conversation).filter(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses),
        Conversation.status.in_(pending_statuses),
    ).count()

    human_handling = db_session.query(Conversation).filter(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses),
        Conversation.assigned_agent_id.isnot(None),
        Conversation.status.notin_(pending_statuses),
    ).count()

    open_convs = db_session.query(Conversation).filter(
        base_unmerged,
        Conversation.status.notin_(resolved_statuses),
        Conversation.assigned_agent_id.is_(None),
        Conversation.status.notin_([ConversationStatus.AI_HANDLING] + pending_statuses),
    ).count()

    # Exact counts from our fixture
    assert all_unresolved == 4
    assert ai_handling == 1  # conv1
    assert human_handling == 1  # conv2
    assert pending == 1  # conv3
    assert open_convs == 1  # conv4
    # Zero overlap and zero gap invariant
    assert ai_handling + human_handling + pending + open_convs == all_unresolved


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
