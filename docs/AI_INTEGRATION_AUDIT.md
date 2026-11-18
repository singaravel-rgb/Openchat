# OpenChat AI Integration & Google Gemini Audit Report

## Overview
This document evaluates the AI orchestration architecture, provider connectivity, retrieval-augmented generation (RAG), and action-claim safety guardrails in OpenChat v1.0.0.

---

## 1. Configured AI Provider & Live Connectivity

- **Configured Primary Provider**: `gemini`
- **Model**: `gemini-flash-lite-latest` (with fallback to `gemini-flash-latest`)
- **API Version**: Google Gemini official REST v1beta endpoints.
- **Provider Status**: Fully operational.
- **Verification Method**: Live asynchronous HTTP client calls to Google Generative Language API.

### Verified Response Metrics
- **Average Inference Latency**: ~1,100ms - 2,500ms
- **Token Estimation**: Prompt tokens and completion tokens recorded in `ai_usages` table.
- **Cost Estimation**: Calculated dynamically using standard rate cards (`$0.0375 / 1M` prompt tokens, `$0.15 / 1M` completion tokens).

---

## 2. Knowledge Base Retrieval & Grounding (RAG)

Knowledge base grounding retrieves matching articles and FAQs from PostgreSQL using scored token match and title matching:

```
Customer Message
      ↓
[Tokenize & Sanitize Query]
      ↓
[Query PostgreSQL FAQs (Score 3.0x Title + 1.0x Answer)]
      ↓
[Query PostgreSQL Articles (Score 2.5x Title + 1.0x Content)]
      ↓
[Top Scored Knowledge Hits Injected into Gemini System Prompt]
      ↓
[Gemini Generates Grounded Response with Source Citations]
```

### Reward Store Grounding Validation
We tested customer inquiries against the 30 ingested Reward Store articles:
1. **Query**: *"What are the Forex conversion rates and handling fees?"*
   - Top Hit: `[FAQ #25]` (Score: 11.0)
   - Live AI Output: Quoted XE.com mid-market rate policy and handling fee transparency directly from The Reward Store guidelines with `[Source faq:25]`.
2. **Query**: *"Can I use The Recharge Store as a guest user without registering?"*
   - Top Hit: `[FAQ #14]` (Score: 9.0)
   - Live AI Output: Confirmed guest user recharge availability without requiring full account registration.

---

## 3. Action-Claim Safety Guardrails

OpenChat enforces strict guardrails to prevent AI from hallucinating completed business actions:

### Implemented Rule (`enforce_action_claim_safety`):
AI and agents must NEVER claim that an irreversible action (refund, cancellation, account deletion, payment, booking change) has been completed unless executed by a verified backend transaction.

When the customer makes an inquiry or demand regarding sensitive actions (e.g. *"Please refund $500 to my card"*):
1. `detect_sensitive_or_restricted` detects sensitive action keywords (`refund`, `cancel`, `credit card`, `delete account`).
2. If any model output attempts to claim *"I have refunded..."* or *"Your subscription has been canceled"*, `enforce_action_claim_safety` intercepts and sanitizes the output:
   > *"I have recorded your request. A support agent will review your account and assist with submitting this for processing."*
3. The conversation status is automatically escalated to human support and assigned to an available agent.
