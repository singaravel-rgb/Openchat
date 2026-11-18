import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.enums import ConversationStatus
from app.services.assignment_service import get_available_agents, assign_conversation_to_agent

def test_available_agents_workload_ordering_and_realistic_names():
    """Verify assignment logic orders by workload and only contains realistic agent names."""
    db: Session = SessionLocal()
    try:
        agents = get_available_agents(db)
        # Verify no confusing test agent names exist in available roster
        for agent in agents:
            assert "Merge" not in agent.full_name, f"Confusing agent name found: {agent.full_name}"
            assert "Link" not in agent.full_name, f"Confusing agent name found: {agent.full_name}"
            assert "Cross" not in agent.full_name, f"Confusing agent name found: {agent.full_name}"
            # Verify capacity constraint
            profile = agent.agent_profile
            assert profile.is_available is True
            assert profile.active_conversations < profile.max_conversations

        # Verify ordering: ascending order of active_conversations
        if len(agents) > 1:
            for i in range(len(agents) - 1):
                assert agents[i].agent_profile.active_conversations <= agents[i + 1].agent_profile.active_conversations
    finally:
        db.close()


def test_ai_escalation_assigns_human_agent_without_merging_or_linking():
    """Verify AI escalation flow assigns a human agent and never triggers any merge or link."""
    db: Session = SessionLocal()
    try:
        # Create a test customer conversation
        customer = db.query(User).filter(User.role == "customer").first()
        if not customer:
            customer = User(email="test_cust_esc@example.com", full_name="Escalation Customer", role="customer")
            db.add(customer)
            db.commit()

        conv = Conversation(
            customer_id=customer.id,
            subject="Billing discrepancy needing escalation",
            status=ConversationStatus.PENDING,
            channel="web",
            priority="normal"
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

        # Ensure initial state: not assigned, not merged, no links
        assert conv.assigned_agent_id is None
        assert conv.merged_into_id is None

        # Execute assignment via standard workflow (same method called during AI escalation)
        assigned = assign_conversation_to_agent(db, conv)
        db.commit()
        db.refresh(conv)

        # 1. Verification of assignment
        assert assigned is True
        assert conv.assigned_agent_id is not None
        assigned_user = db.query(User).filter(User.id == conv.assigned_agent_id).first()
        assert assigned_user is not None
        # Agent name must be realistic (not "Merge Agent")
        assert "Merge" not in assigned_user.full_name
        assert "Link" not in assigned_user.full_name
        assert "Cross" not in assigned_user.full_name

        # 2. Verification that NO merge or link occurred
        assert conv.merged_into_id is None, "Conversation was erroneously merged during assignment!"
        assert conv.status != ConversationStatus.MERGED, "Conversation status was set to MERGED!"

        # Check system message generated during assignment
        system_msgs = db.query(Message).filter(
            Message.conversation_id == conv.id
        ).all()
        assert len(system_msgs) >= 1
        assign_msg_content = system_msgs[-1].content
        assert f"assigned to {assigned_user.full_name}" in assign_msg_content
        assert "merge" not in assign_msg_content.lower()
        assert "link" not in assign_msg_content.lower()

        # Clean up test conversation
        db.query(Message).filter(Message.conversation_id == conv.id).delete()
        db.delete(conv)
        db.commit()
    finally:
        db.close()
