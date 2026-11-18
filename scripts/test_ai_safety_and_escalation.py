"""
Verification test script for OpenChat:
Real AI Integration, Response Safety, Resolution & Escalation Matrix.
"""
import os
import sys
import asyncio
import json

sys.path.append(os.path.abspath("backend"))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.conversation import Conversation, ConversationStatus
from app.models.message import Message, MessageSenderType, MessageType
from app.models.knowledge import FAQ, Article
from app.models.ai import AIConfig, AIUsageLog
from app.services.ai_service import (
    process_ai_turn,
    RuntimeAIConfig,
    to_runtime_config,
    get_or_create_ai_config,
    enforce_action_claim_safety,
)
from app.services.conversation_service import process_customer_message, create_conversation
from app.schemas.conversation import ConversationCreate


async def run_tests():
    db = SessionLocal()
    print("=== STARTING AI INTEGRATION AND SAFETY VERIFICATION ===")
    
    # 0. Get customer and agent
    customer = db.query(User).filter(User.role == "customer").first()
    if not customer:
        customer = User(email="test_cust_ai@demo.com", full_name="Test Customer", role="customer", is_active=True)
        db.add(customer)
        db.commit()
        db.refresh(customer)
    
    agent = db.query(User).filter(User.role == "agent").first()

    results = {}

    # ---------------------------------------------------------
    # SCENARIO 1: Question answered using published knowledge base
    # ---------------------------------------------------------
    print("\n--- Scenario 1: Question answered using published KB ---")
    conv1 = Conversation(customer_id=customer.id, subject="Support hours query", status=ConversationStatus.AI_HANDLING)
    db.add(conv1)
    db.commit()
    db.refresh(conv1)

    # Use demo runtime with published KB enabled
    runtime_demo = RuntimeAIConfig(
        ai_enabled=True,
        provider="demo",
        model="demo",
        confidence_threshold=0.55,
        escalation_rules={"escalate_on_sensitive": True, "escalate_on_uncertain": True, "max_ai_turns": 6},
        knowledge_sources={"faqs": True, "articles": True},
    )

    cust_msg1 = Message(
        conversation_id=conv1.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="What are your support hours?",
    )
    db.add(cust_msg1)
    db.commit()

    res1 = await process_ai_turn(db, conv1, [cust_msg1], customer, runtime=runtime_demo)
    print(f"Decision: {res1.decision}")
    print(f"Should escalate: {res1.should_escalate}")
    print(f"Sources: {res1.sources}")
    print(f"Answer: {res1.answer[:120]}...")

    assert res1.decision == "answered", f"Expected answered, got {res1.decision}"
    assert res1.should_escalate is False, "Expected should_escalate to be False"
    assert len(res1.sources) > 0, "Expected at least 1 knowledge source hit"
    assert any("faq" in s.get("type", "") for s in res1.sources), "Expected FAQ source"
    results["scenario_1_published_kb"] = {
        "status": "PASSED",
        "decision": res1.decision,
        "should_escalate": res1.should_escalate,
        "sources": res1.sources,
        "answer_sample": res1.answer[:150],
    }

    # ---------------------------------------------------------
    # SCENARIO 2: Question with no matching knowledge base content
    # ---------------------------------------------------------
    print("\n--- Scenario 2: Question with no matching KB content ---")
    conv2 = Conversation(customer_id=customer.id, subject="Unknown topic", status=ConversationStatus.AI_HANDLING)
    db.add(conv2)
    db.commit()
    db.refresh(conv2)

    cust_msg2 = Message(
        conversation_id=conv2.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="What is the quantum entanglement orbital velocity of Jupiter?",
    )
    db.add(cust_msg2)
    db.commit()

    res2 = await process_ai_turn(db, conv2, [cust_msg2], customer, runtime=runtime_demo)
    print(f"Decision: {res2.decision}")
    print(f"Should escalate: {res2.should_escalate}")
    print(f"Escalation reason: {res2.escalation_reason}")
    print(f"Sources: {res2.sources}")
    print(f"Answer: {res2.answer}")

    assert res2.decision in ("abstain", "clarify", "escalate"), f"Expected abstain/escalate, got {res2.decision}"
    assert res2.should_escalate is True, "Expected escalation on uncertain/no knowledge"
    assert len(res2.sources) == 0, "Expected 0 sources for completely unrelated query"
    assert res2.context_summary is not None, "Expected handoff summary context"
    results["scenario_2_no_matching_kb"] = {
        "status": "PASSED",
        "decision": res2.decision,
        "should_escalate": res2.should_escalate,
        "escalation_reason": res2.escalation_reason,
        "sources_count": len(res2.sources),
        "context_summary_present": bool(res2.context_summary),
    }

    # ---------------------------------------------------------
    # SCENARIO 3: Sensitive request (billing / refund / cancellation)
    # ---------------------------------------------------------
    print("\n--- Scenario 3: Sensitive request (billing/refund) ---")
    conv3 = Conversation(customer_id=customer.id, subject="Refund inquiry", status=ConversationStatus.AI_HANDLING)
    db.add(conv3)
    db.commit()
    db.refresh(conv3)

    cust_msg3 = Message(
        conversation_id=conv3.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="I demand an immediate refund for unauthorized charge on my credit card!",
    )
    db.add(cust_msg3)
    db.commit()

    res3 = await process_ai_turn(db, conv3, [cust_msg3], customer, runtime=runtime_demo)
    print(f"Decision: {res3.decision}")
    print(f"Should escalate: {res3.should_escalate}")
    print(f"Escalation reason: {res3.escalation_reason}")
    print(f"Answer: {res3.answer}")

    assert res3.decision == "escalate", f"Expected escalate, got {res3.decision}"
    assert res3.should_escalate is True, "Expected should_escalate to be True"
    assert "sensitive" in (res3.escalation_reason or "").lower(), "Expected sensitive in escalation reason"
    results["scenario_3_sensitive_request"] = {
        "status": "PASSED",
        "decision": res3.decision,
        "should_escalate": res3.should_escalate,
        "escalation_reason": res3.escalation_reason,
        "answer": res3.answer,
    }

    # ---------------------------------------------------------
    # SCENARIO 4: Explicit human agent request
    # ---------------------------------------------------------
    print("\n--- Scenario 4: Explicit human agent request ---")
    conv4 = Conversation(customer_id=customer.id, subject="Human agent request", status=ConversationStatus.AI_HANDLING)
    db.add(conv4)
    db.commit()
    db.refresh(conv4)

    cust_msg4 = Message(
        conversation_id=conv4.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="Please transfer me to a human representative right now",
    )
    db.add(cust_msg4)
    db.commit()

    res4 = await process_ai_turn(db, conv4, [cust_msg4], customer, runtime=runtime_demo)
    print(f"Decision: {res4.decision}")
    print(f"Should escalate: {res4.should_escalate}")
    print(f"Escalation reason: {res4.escalation_reason}")
    print(f"Answer: {res4.answer}")

    assert res4.decision == "handoff_requested", f"Expected handoff_requested, got {res4.decision}"
    assert res4.should_escalate is True, "Expected should_escalate to be True"
    assert res4.context_summary is not None, "Expected handoff summary context"
    results["scenario_4_human_request"] = {
        "status": "PASSED",
        "decision": res4.decision,
        "should_escalate": res4.should_escalate,
        "escalation_reason": res4.escalation_reason,
        "answer": res4.answer,
    }

    # ---------------------------------------------------------
    # SCENARIO 5: AI Provider Failure / Real Provider Authentication Error
    # ---------------------------------------------------------
    print("\n--- Scenario 5: Real Provider Authentication Error & Escalation ---")
    conv5 = Conversation(customer_id=customer.id, subject="Real provider failure test", status=ConversationStatus.AI_HANDLING)
    db.add(conv5)
    db.commit()
    db.refresh(conv5)

    cust_msg5 = Message(
        conversation_id=conv5.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="How do I configure webhook alerts in OpenChat?",
    )
    db.add(cust_msg5)
    db.commit()

    # Configure real OpenAI provider with an invalid key to test genuine HTTP 401 handling
    runtime_real_openai = RuntimeAIConfig(
        ai_enabled=True,
        provider="openai",
        model="gpt-4o-mini",
        openai_api_key="sk-test-invalid-key-for-auth-verification-12345",
        confidence_threshold=0.55,
        escalation_rules={"escalate_on_sensitive": True, "escalate_on_uncertain": True, "max_ai_turns": 6},
    )

    res5 = await process_ai_turn(db, conv5, [cust_msg5], customer, runtime=runtime_real_openai)
    print(f"Decision: {res5.decision}")
    print(f"Should escalate: {res5.should_escalate}")
    print(f"Escalation reason: {res5.escalation_reason}")
    print(f"Answer: {res5.answer}")
    print(f"Error captured: {res5.error}")

    assert res5.decision == "escalate", f"Expected escalate, got {res5.decision}"
    assert res5.should_escalate is True, "Expected should_escalate to be True"
    assert "[DEMO AI]" not in res5.answer, "MUST NOT fall back to fake Demo AI response!"
    assert "OpenAI" in res5.answer, "Expected clear OpenAI service message"
    assert res5.error is not None, "Expected error to be captured"
    assert "401" in res5.error or "Authentication" in res5.error, f"Expected 401 Authentication Error, got {res5.error}"

    # Verify AIUsageLog entry recorded failure
    latest_log = (
        db.query(AIUsageLog)
        .filter(AIUsageLog.conversation_id == conv5.id)
        .order_by(AIUsageLog.id.desc())
        .first()
    )
    assert latest_log is not None, "Expected AIUsageLog to be recorded"
    assert latest_log.success is False, f"Expected success=False in log, got {latest_log.success}"
    assert latest_log.error_message is not None, "Expected error_message in log"
    assert latest_log.provider == "openai", f"Expected provider='openai', got {latest_log.provider}"
    print(f"AIUsageLog verified: id={latest_log.id}, success={latest_log.success}, error={latest_log.error_message[:60]}...")

    results["scenario_5_real_provider_error"] = {
        "status": "PASSED",
        "provider": latest_log.provider,
        "model": latest_log.model,
        "success": latest_log.success,
        "error_message": latest_log.error_message,
        "customer_answer": res5.answer,
        "decision": res5.decision,
        "escalated": res5.should_escalate,
    }

    # ---------------------------------------------------------
    # SCENARIO 6: Action-Claim Safety Enforcement
    # ---------------------------------------------------------
    print("\n--- Scenario 6: Action-Claim Safety Enforcement ---")
    fabricated_claims = [
        "I have successfully processed a full refund to your card for $150.",
        "Your refund has been issued to your bank account.",
        "I have cancelled your subscription immediately.",
        "Your account has been deleted permanently from our database.",
    ]

    sanitized_outputs = []
    for claim in fabricated_claims:
        sanitized = enforce_action_claim_safety(claim)
        print(f"Original:  {claim}")
        print(f"Sanitized: {sanitized}")
        assert "successfully processed a full refund" not in sanitized
        assert "cancelled your subscription immediately" not in sanitized
        assert "deleted permanently" not in sanitized
        assert "A support agent will review" in sanitized
        sanitized_outputs.append({"original": claim, "sanitized": sanitized})

    results["scenario_6_action_claim_safety"] = {
        "status": "PASSED",
        "tests": sanitized_outputs,
    }

    print("\n=== ALL AI SAFETY & ESCALATION SCENARIOS PASSED SUCCESSFULLY! ===")
    print(json.dumps(results, indent=2))
    db.close()
    return results

if __name__ == "__main__":
    asyncio.run(run_tests())
