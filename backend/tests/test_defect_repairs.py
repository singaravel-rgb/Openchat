import sys
from pathlib import Path
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.main import app
from app.db.session import SessionLocal
from app.core.enums import ConversationStatus
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation
from app.models.user import User
from app.services.assignment_service import reassign_conversation
from app.services.conversation_service import assign_conversation, take_conversation, merge_conversations

client = TestClient(app)


def test_cannot_assign_to_offline_agent():
    """Verify that an offline agent (is_available=False) CANNOT receive assignments."""
    db = SessionLocal()
    try:
        # Create or fetch test users
        admin = db.query(User).filter(User.role == "admin").first()
        customer = db.query(User).filter(User.role == "customer").first()
        agent = db.query(User).filter(User.role == "agent").first()

        assert admin and customer and agent, "Seed data missing"

        # Set agent offline
        profile = db.query(AgentProfile).filter(AgentProfile.user_id == agent.id).first()
        if not profile:
            profile = AgentProfile(user_id=agent.id, is_available=False, max_conversations=5, active_conversations=0)
            db.add(profile)
        else:
            profile.is_available = False
        db.commit()

        # Create a test conversation
        conv = Conversation(
            customer_id=customer.id,
            status=ConversationStatus.PENDING,
            channel="web_chat",
            subject="Offline assignment test",
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Attempting to assign to offline agent must raise HTTPException 400
        with pytest.raises(HTTPException) as exc_info:
            assign_conversation(db, conv, actor=admin, agent_id=agent.id)
        assert exc_info.value.status_code == 400
        assert "offline" in exc_info.value.detail.lower()

        # Reassigning via reassign_conversation must return False
        success = reassign_conversation(db, conv, new_agent_id=agent.id)
        assert success is False

        # Take conversation by offline agent must raise HTTPException 400
        with pytest.raises(HTTPException) as exc_info:
            take_conversation(db, conv, agent=agent)
        assert exc_info.value.status_code == 400
        assert "offline" in exc_info.value.detail.lower()

        # Now set agent back to online
        profile.is_available = True
        db.commit()

        # Now assignment should succeed
        assigned_conv = assign_conversation(db, conv, actor=admin, agent_id=agent.id)
        assert assigned_conv.assigned_agent_id == agent.id
        assert assigned_conv.status == ConversationStatus.ASSIGNED

    finally:
        db.close()


def test_merge_preserves_internal_note():
    """Verify that merging conversations appends source global internal note to target."""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin").first()
        customer = db.query(User).filter(User.role == "customer").first()
        assert admin and customer

        conv1 = Conversation(
            customer_id=customer.id,
            status=ConversationStatus.OPEN,
            channel="web_chat",
            subject="Ticket 1 for note merge",
            global_note="Important VIP context from ticket 1",
        )
        conv2 = Conversation(
            customer_id=customer.id,
            status=ConversationStatus.OPEN,
            channel="web_chat",
            subject="Ticket 2 for note merge",
            global_note="Existing notes on ticket 2",
        )
        db.add_all([conv1, conv2])
        db.commit()
        db.refresh(conv1)
        db.refresh(conv2)

        target = merge_conversations(db, source_id=conv1.id, target_id=conv2.id, actor=admin)
        assert target.id == conv2.id
        assert "Important VIP context from ticket 1" in target.global_note
        assert "Existing notes on ticket 2" in target.global_note
    finally:
        db.close()
