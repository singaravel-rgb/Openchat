import pytest
import re
from app.services.ai_service import clean_customer_facing_text, _validate_output, RuntimeAIConfig, KnowledgeHit

def test_clean_customer_facing_text_strips_internal_sources():
    # Test case 1: Raw [Source article:2] tag
    raw = "All refunds require approval [Source article:2]. Please provide your order ID."
    cleaned = clean_customer_facing_text(raw)
    assert "[Source article:2]" not in cleaned
    assert "All refunds require approval." in cleaned or "All refunds require approval" in cleaned

    # Test case 2: [Source: verified knowledge context]
    raw2 = "I don't have enough verified information in my current knowledge base regarding orders or bookings to assist you further [Source: verified knowledge context]."
    cleaned2 = clean_customer_facing_text(raw2)
    assert "[Source" not in cleaned2
    assert "verified knowledge" not in cleaned2
    assert "knowledge base" not in cleaned2
    assert "Could you share a little more information" in cleaned2

    # Test case 3: Asking whether customer wants escalation
    raw3 = "Could you please provide a bit more detail about your order or booking, or would you like me to recommend escalation to a human agent?"
    cleaned3 = clean_customer_facing_text(raw3)
    assert "recommend escalation" not in cleaned3
    assert "escalation to a human agent" not in cleaned3

    # Test case 4: Sources: [Source faq:1] [Source faq:2]
    raw4 = "Our return policy allows returns within 30 days.\n\nSources: [Source faq:1] [Source faq:2]"
    cleaned4 = clean_customer_facing_text(raw4)
    assert "Sources:" not in cleaned4
    assert "[Source" not in cleaned4
    assert "Our return policy allows returns within 30 days." in cleaned4

def test_validate_output_does_not_append_sources():
    cfg = RuntimeAIConfig()
    hits = [KnowledgeHit(source_type="article", id=5, title="Refund Policy", content="Refunds take 5-7 business days.")]
    text = "Refunds generally take 5 to 7 business days to process back to your payment method."
    cleaned, should_escalate, dec = _validate_output(text, cfg, hits, is_greeting=False)
    assert "Sources:" not in cleaned
    assert "[Source" not in cleaned
    assert "Refunds generally take 5 to 7 business days" in cleaned
