"""
Verification test script for OpenChat Google Gemini Integration:
Real Gemini API calls, Knowledge Grounding, Resolution & Escalation Matrix, and Human Handover.
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
from app.services.conversation_service import process_customer_message

REAL_GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")


async def run_gemini_tests():
    db = SessionLocal()
    print("=================================================================")
    print("=== STARTING GOOGLE GEMINI REAL API & KNOWLEDGE VERIFICATION ===")
    print("=================================================================")

    # Ensure test customer
    customer = db.query(User).filter(User.role == "customer").first()
    if not customer:
        customer = User(email="customer_gemini_test@demo.com", full_name="Gemini Customer", role="customer", is_active=True)
        db.add(customer)
        db.commit()
        db.refresh(customer)

    runtime_gemini = RuntimeAIConfig(
        ai_enabled=True,
        provider="gemini",
        model="gemini-flash-lite-latest",
        gemini_api_key=REAL_GEMINI_KEY,
        confidence_threshold=0.55,
        escalation_rules={"escalate_on_sensitive": True, "escalate_on_uncertain": True, "max_ai_turns": 6},
        knowledge_sources={"faqs": True, "articles": True},
    )

    results = {}

    # ---------------------------------------------------------
    # SCENARIO 1: Question answered from existing published FAQ
    # ---------------------------------------------------------
    print("\n--- Scenario 1: Real Gemini response from published FAQ ---")
    conv1 = Conversation(customer_id=customer.id, subject="FAQ inquiry", status=ConversationStatus.AI_HANDLING)
    db.add(conv1)
    db.commit()
    db.refresh(conv1)

    msg1 = Message(
        conversation_id=conv1.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="What are your support hours?",
    )
    db.add(msg1)
    db.commit()

    res1 = await process_ai_turn(db, conv1, [msg1], customer, runtime=runtime_gemini)
    print(f"Provider used: {res1.provider}")
    print(f"Model used: {res1.model}")
    print(f"Decision: {res1.decision}")
    print(f"Should escalate: {res1.should_escalate}")
    print(f"Knowledge sources retrieved: {len(res1.sources)}")
    print(f"Sources detail: {[{'type': s['type'], 'id': s['id'], 'title': s['title']} for s in res1.sources]}")
    print(f"Answer from Gemini: {res1.answer}")
    print(f"Latency: {res1.latency_ms}ms")
    print(f"Usage tokens: {res1.usage}")

    assert res1.provider == "gemini", f"Expected gemini, got {res1.provider}"
    assert res1.decision == "answered", f"Expected answered, got {res1.decision}"
    assert res1.should_escalate is False, "Expected should_escalate=False"
    assert len(res1.sources) > 0, "Expected knowledge sources to be retrieved"
    assert any(s["type"] == "faq" and s["id"] == 2 for s in res1.sources), "Expected FAQ #2 in sources"
    assert "[DEMO AI]" not in res1.answer, "MUST be a genuine Gemini response, not demo!"

    results["scenario_1_published_faq"] = {
        "status": "PASSED",
        "provider": res1.provider,
        "model": res1.model,
        "decision": res1.decision,
        "should_escalate": res1.should_escalate,
        "sources": res1.sources,
        "answer": res1.answer,
        "latency_ms": res1.latency_ms,
        "usage": res1.usage,
    }

    # ---------------------------------------------------------
    # SCENARIO 2: Question answered from published Knowledge Base Article
    # ---------------------------------------------------------
    print("\n--- Scenario 2: Real Gemini response from published Article ---")
    conv2 = Conversation(customer_id=customer.id, subject="Article inquiry", status=ConversationStatus.AI_HANDLING)
    db.add(conv2)
    db.commit()
    db.refresh(conv2)

    msg2 = Message(
        conversation_id=conv2.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="How do I authenticate with the API and handle rate limits?",
    )
    db.add(msg2)
    db.commit()

    res2 = await process_ai_turn(db, conv2, [msg2], customer, runtime=runtime_gemini)
    print(f"Provider used: {res2.provider}")
    print(f"Model used: {res2.model}")
    print(f"Decision: {res2.decision}")
    print(f"Should escalate: {res2.should_escalate}")
    print(f"Knowledge sources retrieved: {len(res2.sources)}")
    print(f"Sources detail: {[{'type': s['type'], 'id': s['id'], 'title': s['title']} for s in res2.sources]}")
    print(f"Answer from Gemini: {res2.answer}")
    print(f"Latency: {res2.latency_ms}ms")
    print(f"Usage tokens: {res2.usage}")

    assert res2.provider == "gemini", f"Expected gemini, got {res2.provider}"
    assert res2.decision == "answered", f"Expected answered, got {res2.decision}"
    assert res2.should_escalate is False, "Expected should_escalate=False"
    assert len(res2.sources) > 0, "Expected knowledge sources to be retrieved"
    assert any(s["type"] == "article" and s["id"] == 3 for s in res2.sources), "Expected Article #3 (API Auth Guide) in sources"
    assert "[DEMO AI]" not in res2.answer, "MUST be a genuine Gemini response, not demo!"

    results["scenario_2_published_article"] = {
        "status": "PASSED",
        "provider": res2.provider,
        "model": res2.model,
        "decision": res2.decision,
        "should_escalate": res2.should_escalate,
        "sources": res2.sources,
        "answer": res2.answer,
        "latency_ms": res2.latency_ms,
        "usage": res2.usage,
    }

    # ---------------------------------------------------------
    # SCENARIO 3: Question with no matching knowledge base content
    # ---------------------------------------------------------
    print("\n--- Scenario 3: Question with no matching knowledge ---")
    conv3 = Conversation(customer_id=customer.id, subject="No matching KB", status=ConversationStatus.AI_HANDLING)
    db.add(conv3)
    db.commit()
    db.refresh(conv3)

    msg3 = Message(
        conversation_id=conv3.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="What is the warp drive dilithium crystal ratio for relativistic acceleration?",
    )
    db.add(msg3)
    db.commit()

    res3 = await process_ai_turn(db, conv3, [msg3], customer, runtime=runtime_gemini)
    print(f"Decision: {res3.decision}")
    print(f"Should escalate: {res3.should_escalate}")
    print(f"Escalation reason: {res3.escalation_reason}")
    print(f"Sources retrieved: {len(res3.sources)}")
    print(f"Answer: {res3.answer}")

    assert res3.decision in ("abstain", "clarify", "escalate"), f"Expected abstain/escalate, got {res3.decision}"
    assert res3.should_escalate is True, "Expected escalation on missing verified knowledge"
    assert len(res3.sources) == 0, "Expected 0 sources"
    assert res3.context_summary is not None, "Expected context summary for handoff"

    results["scenario_3_no_matching_kb"] = {
        "status": "PASSED",
        "decision": res3.decision,
        "should_escalate": res3.should_escalate,
        "escalation_reason": res3.escalation_reason,
        "sources_count": len(res3.sources),
        "answer": res3.answer,
    }

    # ---------------------------------------------------------
    # SCENARIO 4: Refund or billing request requiring human assistance
    # ---------------------------------------------------------
    print("\n--- Scenario 4: Refund or billing request (sensitive) ---")
    conv4 = Conversation(customer_id=customer.id, subject="Refund request", status=ConversationStatus.AI_HANDLING)
    db.add(conv4)
    db.commit()
    db.refresh(conv4)

    msg4 = Message(
        conversation_id=conv4.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="I need a refund for $250 charged to my credit card yesterday!",
    )
    db.add(msg4)
    db.commit()

    res4 = await process_ai_turn(db, conv4, [msg4], customer, runtime=runtime_gemini)
    print(f"Decision: {res4.decision}")
    print(f"Should escalate: {res4.should_escalate}")
    print(f"Escalation reason: {res4.escalation_reason}")
    print(f"Answer: {res4.answer}")

    assert res4.decision == "escalate", f"Expected escalate, got {res4.decision}"
    assert res4.should_escalate is True, "Expected escalation"
    assert "sensitive" in (res4.escalation_reason or "").lower(), "Expected sensitive reason"
    # Action claim safety
    assert "successfully processed" not in res4.answer.lower()
    assert "refund has been issued" not in res4.answer.lower()

    results["scenario_4_sensitive_refund"] = {
        "status": "PASSED",
        "decision": res4.decision,
        "should_escalate": res4.should_escalate,
        "escalation_reason": res4.escalation_reason,
        "answer": res4.answer,
    }

    # ---------------------------------------------------------
    # SCENARIO 5: Gemini API failure / Invalid API key
    # ---------------------------------------------------------
    print("\n--- Scenario 5: Real Gemini API Failure / Invalid Key ---")
    conv5 = Conversation(customer_id=customer.id, subject="Gemini Failure Test", status=ConversationStatus.AI_HANDLING)
    db.add(conv5)
    db.commit()
    db.refresh(conv5)

    msg5 = Message(
        conversation_id=conv5.id,
        sender_id=customer.id,
        sender_type=MessageSenderType.CUSTOMER,
        message_type=MessageType.TEXT,
        content="What are your support hours?",
    )
    db.add(msg5)
    db.commit()

    runtime_invalid = RuntimeAIConfig(
        ai_enabled=True,
        provider="gemini",
        model="gemini-flash-latest",
        gemini_api_key="AQ.invalid-key-for-auth-testing-12345",
        confidence_threshold=0.55,
        escalation_rules={"escalate_on_sensitive": True, "escalate_on_uncertain": True, "max_ai_turns": 6},
    )

    res5 = await process_ai_turn(db, conv5, [msg5], customer, runtime=runtime_invalid)
    print(f"Decision: {res5.decision}")
    print(f"Should escalate: {res5.should_escalate}")
    print(f"Escalation reason: {res5.escalation_reason}")
    print(f"Error captured: {res5.error}")
    print(f"Answer: {res5.answer}")

    assert res5.decision == "escalate", f"Expected escalate, got {res5.decision}"
    assert res5.should_escalate is True, "Expected should_escalate=True"
    assert res5.error is not None, "Expected error to be captured"
    assert "Gemini Authentication Error" in res5.error or "API key not valid" in res5.error or "API_KEY_INVALID" in res5.error
    assert "[DEMO AI]" not in res5.answer, "MUST NOT fall back to fake Demo AI response!"
    assert "Google Gemini" in res5.answer, "Expected clear Google Gemini service failure message"

    # Verify AIUsageLog recorded failed turn
    log_entry = (
        db.query(AIUsageLog)
        .filter(AIUsageLog.conversation_id == conv5.id)
        .order_by(AIUsageLog.id.desc())
        .first()
    )
    assert log_entry is not None, "Expected AIUsageLog entry"
    assert log_entry.success is False, f"Expected success=False, got {log_entry.success}"
    assert log_entry.provider == "gemini", f"Expected provider='gemini', got {log_entry.provider}"
    print(f"Verified AIUsageLog: id={log_entry.id}, provider={log_entry.provider}, success={log_entry.success}")

    results["scenario_5_gemini_api_failure"] = {
        "status": "PASSED",
        "provider": res5.provider,
        "error_captured": res5.error,
        "answer_to_customer": res5.answer,
        "decision": res5.decision,
        "should_escalate": res5.should_escalate,
        "logged_success": log_entry.success,
    }

    # ---------------------------------------------------------
    # SCENARIO 6: Respect Human Handover (AI stops replying)
    # ---------------------------------------------------------
    print("\n--- Scenario 6: Respect Human Handover ---")
    conv6 = Conversation(
        customer_id=customer.id,
        subject="Handover test",
        status=ConversationStatus.PENDING,  # Escalated to human queue
    )
    db.add(conv6)
    db.commit()
    db.refresh(conv6)

    # Process customer message using conversation_service
    customer_msg = await process_customer_message(
        db,
        conversation=conv6,
        customer=customer,
        content="Is a human agent there?",
    )

    # Verify that NO AI message was generated because status != AI_HANDLING
    ai_messages = (
        db.query(Message)
        .filter(Message.conversation_id == conv6.id, Message.sender_type == MessageSenderType.AI)
        .all()
    )
    print(f"AI messages generated after handover: {len(ai_messages)}")
    assert len(ai_messages) == 0, f"Expected 0 AI messages after human handover, got {len(ai_messages)}"
    print(f"Conversation status remains: {conv6.status}")

    results["scenario_6_human_handover_respected"] = {
        "status": "PASSED",
        "ai_messages_after_handover": len(ai_messages),
        "conversation_status": str(conv6.status),
    }

    print("\n=================================================================")
    print("=== ALL 6 REAL GEMINI & KNOWLEDGE SCENARIOS PASSED WITH EVIDENCE ===")
    print("=================================================================")
    print(json.dumps(results, indent=2))
    db.close()
    return results


if __name__ == "__main__":
    asyncio.run(run_gemini_tests())
