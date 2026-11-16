# OpenChat — Current Project Reality Report

**Generated:** 2026-11-16
**Scope:** Read-only inspection of the entire OpenChat repository. No application files were modified.
**Method:** Manual code review, API testing against a running instance, pytest execution, frontend production build, and runtime verification.

---

## 1. Current Architecture

| Layer | Technology | Location |
|-------|-----------|----------|
| Backend API | FastAPI (Python 3.12) | `backend/app/` |
| Database | PostgreSQL 17 | `compose.yaml` |
| Cache / rate-limit | Redis 7 | `compose.yaml` |
| Frontend | Next.js 16 (React 18, TypeScript) | `frontend/src/` |
| Widget embed | Vanilla JS (self-contained string) | `backend/app/api/v1/widget.py` -> `build_widget_js()` |
| Migrations | Alembic | `backend/migrations/versions/` |
| Tests | pytest | `backend/tests/` |

### Backend routers (all under `/api/v1/`)

| Prefix | File | Purpose |
|---|---|---|
| `/health` | `health.py` | app / db / redis health |
| `/auth` | `auth.py` | login, me, change-password |
| `/conversations` | `conversations.py` | customer conversation CRUD |
| `/agent` | `agent.py` | agent inbox, messages, take/assign/resolve, availability |
| `/admin` | `admin.py` | admin conversations, agents, stats, audit-logs, csat |
| `/admin/knowledge` | `admin_knowledge.py` | categories, FAQs, articles |
| `/admin/ai` | `admin_ai.py` | AI configuration |
| `/admin/settings` | `admin_settings.py` | general / notifications / assignment settings |
| `/admin/widget` | `admin_widget.py` | widget config + embed snippet |
| `/admin/sla` | `sla.py` | SLA configs |
| `/admin/reports` | `reports.py` | metrics, agents, time-series, knowledge |
| `/widget` | `widget.py` | public widget API + `embed.js` |
| `/attachments` | `attachments.py` | file attachments |
| `/canned-responses` | `canned_responses.py` | agent canned replies |
| `/custom-fields` | `custom_fields.py` | conversation custom fields |
| `/teams` | `teams.py` | agent teams |
| `/business-hours` | `business_hours.py` | business hours |
| `/bot-flows` | `bot_flows.py` | bot flow definitions |
| `/webhooks` | `webhooks.py` | webhook endpoints |
| `/automation-rules` | `automation_rules.py` | automation rules |
| `/campaigns` | `campaigns.py` | campaigns |
| `/notifications` | `notifications.py` | user notifications |
| `/knowledge` | `customer_knowledge.py` | public FAQ/article reads |

---

## 2. Current Working Functionality (verified)

| Feature | Classification | Evidence |
|---|---|---|
| Guest widget session | **WORKING** | `test_widget_guest_session_create_restore_and_invalid_session` passes; live API returns `is_guest: true` |
| Authenticated host mode (host-signed JWT) | **WORKING** | `verify_host_identity_token()` in `widget_service.py`; validated valid/expired/bad-issuer/bad-audience/bad-origin cases |
| Widget conversation lifecycle | **WORKING** | Live API: create -> AI reply -> handoff -> assigned -> agent reply -> note -> resolve |
| Idempotency (client_message_id) | **WORKING** | `process_customer_message()` dedupe + unique index `uq_messages_conversation_client_id` |
| Internal note privacy | **WORKING** | `test_internal_note_privacy` passes; widget filters `is_internal` |
| Conversation status transitions | **WORKING** | `ALLOWED_TRANSITIONS` + `transition_status()` enforcement |
| Agent Online/Offline toggle | **WORKING** | `PATCH /agent/availability?is_available=`; persisted in `AgentProfile` |
| Automatic assignment (availability + capacity) | **WORKING** | `assignment_service.assign_conversation_to_agent()`; live handoff auto-assigned |
| AI grounding in FAQ/article content | **WORKING (keyword)** | `retrieve_knowledge_hits()` filters published FAQ + published articles |
| AI escalation on sensitive/uncertain | **WORKING** | `SENSITIVE_PATTERNS`, confidence threshold, `escalate_on_uncertain` |
| AI stops after handoff | **WORKING** | AI reply only fires while `status == AI_HANDLING` (`conversation_service.py:443`) |
| Admin conversation visibility (incl. internal notes) | **WORKING** | Live API admin view returned 9 messages incl. internal |
| Canned responses | **WORKING** | create/list verified; dropdown wired in `ThreePanelWorkspace.tsx:828` |
| Custom fields | **WORKING** | create/list verified; rendered in details panel `ThreePanelWorkspace.tsx:972` |
| Teams | **WORKING (CRUD)** | create/list verified |
| SLA configs | **WORKING (CRUD + apply)** | `apply_sla_to_conversation()` on create; `/admin/sla/configs` verified |
| Webhooks | **WORKING (CRUD)** | create/list verified; delivery not exercised |
| Audit logs | **WORKING** | `/admin/audit-logs` returns entries |
| CSAT | **WORKING (aggregation)** | `/admin/csat` returns distribution |
| Reports | **WORKING** | overview, agents, time-series, knowledge all return 200 with data |
| Knowledge base (categories/FAQs/articles) | **WORKING** | CRUD verified; 4 categories, 6 FAQs, 4 articles seeded |
| Help page (public) | **PARTIALLY WORKING** | `/help` lists published FAQs; `active_conversations` hardcoded `[]` |
| Agent availability excluded from assignment | **WORKING** | `assign_conversation_to_agent` filters `is_available` + capacity |

---

## 3. Partially Working Functionality

| Feature | What works | What is missing |
|---|---|---|
| Help & Support page | Renders published FAQs, search, categories, widget launcher embed | `active_conversations` is hardcoded to `[]` (`help/page.tsx:51`) — authenticated customer's conversations are never loaded; no configurable "entry point" placement |
| AI provider | OpenAI + Anthropic adapters exist (`_call_openai`, `_call_anthropic`) | Default provider is **demo**; live provider requires API keys configured in Admin AI settings or env |
| Knowledge retrieval | Keyword ILIKE scoring over FAQ + article | No vector/embedding semantic search; no document upload (PDF/DOCX) ingestion — only manual article/FAQ text |
| Bot flows | Full CRUD for flows, steps, issues (`bot_flows.py`, models) | **Not wired into conversation flow** — no reference in `conversation_service.py`, `ai_service.py`, or `widget.py`; widget does not load menus |
| FAQ "Chat with us" | `show_chat_action` + `chat_action_text` fields exist | FAQ context is **not** passed into a new conversation; no widget hook consumes it |
| Notifications | Model + API + create calls on agent reply | No real-time push; no polling in agent UI for notification badges (relies on conversation polling) |
| Attachments | Model + API + display in details panel | No upload UI in composer verified |

---

## 4. Missing Functionality

| Feature | Status |
|---|---|
| Bot menu options dynamically loaded by widget | **MISSING** — widget `embed.js` has no menu fetch |
| FAQ option -> new conversation with context | **MISSING** |
| Customer active conversations on Help page | **MISSING** — hardcoded empty |
| Configurable Help/Support entry point on host site | **MISSING** — no admin setting or placement control |
| Real document upload (PDF/DOCX) for knowledge base | **MISSING** — only manual text articles |
| Semantic/vector knowledge retrieval | **MISSING** — keyword only |
| Real-time delivery (WebSocket/SSE) | **MISSING** — widget uses 3s polling; agent UI uses polling |
| Multi-tenant client isolation | **MISSING** — single global widget config; no tenant/client model |
| Busy state (online+at-capacity) surfaced to admin | **PARTIAL** — capacity computed per agent but no "busy" label in admin UI |

---

## 5. Broken Functionality

| Item | Detail |
|---|---|
| None confirmed broken in the core flow | All 10 backend tests pass; 12-step demo journey passes via API |
| Duplicate/stray files | `backend/app/api/v1/conversations.py.bak`, `backend/backend/app/models/agent_profile.py` (nested duplicate path), `backend/reset_conv.py`, `backend/update_widget.py`, `backend/test_handoff.py`, root `tests_e2e_acceptance.py`, `tests_assignment_logic.py` — cleanup needed, not runtime-breaking |

---

## 6. Mocked Functionality

| Item | Detail |
|---|---|
| AI responses | Default provider is **demo** — deterministic, knowledge-grounded but not a real LLM (`_call_demo`). Output prefixed `[DEMO AI]` |
| AI cost/token estimates | `estimate_tokens` uses `len/4` heuristic; pricing table is approximate (`PRICING_RATES`) |
| Seed data | Demo agents (Sarah Wilson, Mike Chen), FAQs, articles, categories from `scripts/seed_demo.py` |

---

## 7. Database and API Coverage

- **Models:** 17 models — User, AgentProfile, Conversation, Message, Attachment, Notification, CSAT, AuditLog, Article, FAQ, Category, WidgetConfig, WidgetSession, AIConfig, AIUsageLog, CannedResponse, CustomField, Team, BusinessHours, BotFlow(+Step+Issue), AutomationRule, Campaign, Webhook, SLAConfig, Setting.
- **Migrations:** Alembic present (`backend/migrations/versions/`), includes `p3ai001` AI config + unique message index `ccbc55c9fd1f`.
- **API coverage is broad** and matches the models for CRUD; however bot-flows/automation-rules/campaigns are CRUD-only with no execution engine.

---

## 8. Frontend Integration Status

- 33 routes build successfully (`npm run build` passes).
- Admin: dashboard, agents, conversations, knowledge (articles/faqs/categories), canned-responses, custom-fields, teams, business-hours, sla, webhooks, reports, settings (general/ai/notifications/rules/widget).
- Agent: three-panel workspace, inbox/pending/assigned/resolved, detail, composer with canned responses, internal notes, resolve/priority/assign modals.
- Customer: `/help`, `/login`, widget test page.
- **Hidden from nav:** automation-rules, bot-flows, campaigns (present as pages but unfinished → hidden in Sidebar).
- API client: `frontend/src/lib/api.ts` covers agent/admin/canned/custom/teams/etc.

---

## 9. Security and Reliability Concerns

1. **Single global widget config** — `get_or_create_widget_config()` returns the first row; no per-client isolation. Multi-tenant requirement not met.
2. **Demo AI in default path** — any deployment without API keys silently uses demo responses.
3. **HTML escaping** — widget `esc()` covers `& < > "`; adequate but not exhaustive.
4. **Rate limiting** — in-memory fallback by default (`_ENABLE_REDIS = False`); Redis limiter exists but disabled.
5. **Secret handling** — AI keys encrypted via `crypto.decrypt_secret`; `SECRET_KEY` in `.env` (dev value present).
6. **Prompt injection** — patterns detected and escalated (`detect_prompt_injection`).
7. **Stray files/duplicates** — `.bak` and nested `backend/backend/` path are hygiene risks.

---

## 10. Test Results and Evidence

**Executed (this session):**
- `python -m pytest tests/ -v` → **10 passed** (Phase1 conversations + Phase2 widget).
- `npm run build` → **success** (33 routes, TypeScript clean).
- Live API: 12-step demo journey passed; host-identity valid/invalid matrix passed; health/db/redis 200.
- Advanced feature API sweep: canned/teams/custom-fields/sla/webhooks/audit/csat/reports/knowledge/settings all 200.

**Not executed:**
- Browser E2E (no browser automation available here) — launcher render, console errors, click-through UI not verified visually.
- Webhook delivery, email/push notifications, real OpenAI/Anthropic calls (no keys), Celery SLA tasks.

---

## 11. Key Files and Modules

- Conversation/AI core: `backend/app/services/conversation_service.py`, `ai_service.py`
- Widget: `backend/app/api/v1/widget.py`, `widget_service.py`
- Assignment: `backend/app/services/assignment_service.py`
- Agent/Admin APIs: `backend/app/api/v1/agent.py`, `admin.py`
- Knowledge: `admin_knowledge.py`, `models/knowledge.py`, `models/ai.py`
- Bot flows (unwired): `bot_flows.py`, `models/bot_flow.py`
- Frontend workspace: `frontend/src/components/ThreePanelWorkspace.tsx`, `Sidebar.tsx`
- Help page: `frontend/src/app/help/page.tsx`
- API client: `frontend/src/lib/api.ts`, types `frontend/src/lib/types.ts`

---

## 12. Dependencies / Credentials for Real AI and Knowledge

- **OpenAI:** `openai` package (in requirements) + `OPENAI_API_KEY` or Admin AI setting (encrypted).
- **Anthropic:** `anthropic` package + `ANTHROPIC_API_KEY` or Admin AI setting.
- **Postgres/Redis:** via `.env` (`POSTGRES_*`, `REDIS_PASSWORD`).
- **Host identity:** `HOST_IDENTITY_PUBLIC_KEY` / `HOST_IDENTITY_JWKS_URL` / issuer / audience (Admin Widget settings or env).
- **Knowledge:** no external vector DB; content entered manually via Admin Knowledge.

---

## 13. Prioritised Gap List (the truth)

### P0 — Must fix before reliable demo
1. **Wire bot flows into the widget + AI** (currently CRUD-only). Exists: models/API. Missing: widget menu fetch, selection into conversation, configured responses. Change: add widget endpoint to fetch published default flow + issues; on selection store `bot_flow_issue_id` on conversation and inject into AI system context.
2. **Help page customer conversations** — `active_conversations` hardcoded `[]`. Change: call authenticated conversation endpoint, render list, allow continue.
3. **Single global widget config / no client isolation** — blocks "client-specific configuration". Change: add `client_id`/tenant scope to WidgetConfig, WidgetSession, conversations; resolve config per origin/client.
4. **Remove stray files** (`*.bak`, nested `backend/backend/`, root test scripts, ad-hoc `backend/*.py`) to avoid confusion.

### P1 — Required for complete customer support experience
5. **FAQ "Chat with us" -> new conversation with context.** Exists: FAQ fields. Missing: widget action carrying `faq_id` into `WidgetConversationCreate` and initial AI prompt.
6. **Configurable Help/Support entry point** (admin-set placement on host). Missing entirely.
7. **Real-time messaging** (WebSocket/SSE) to replace 3s polling for responsiveness.
8. **Attachments upload UI** in widget + agent composer.

### P2 — Important product capabilities
9. **Real AI default path** — guard so demo is explicit; require key for "real" mode; add provider health check in Admin AI.
10. **Semantic/vector retrieval + document ingestion** (PDF/DOCX) for knowledge.
11. **Notification delivery** (email/push) + agent badge polling.
12. **Agent "Busy" state** surfaced in admin UI when online+at capacity.

### P3 — Advanced
13. Automation rules execution engine (currently CRUD-only).
14. Campaigns execution (currently CRUD-only).
15. Redis rate limiting enabled in production; Celery SLA task scheduling verified.
16. Analytics depth (CSAT triggers, satisfaction surveys).

**Bottom line:** The core customer support loop — guest/authenticated widget -> AI (demo, grounded) -> human handoff -> assignment (availability+capacity) -> agent reply -> resolve -> admin visibility — genuinely works and is covered by passing tests. The largest real gaps are multi-tenant isolation, bot-flow execution, Help-page conversations, FAQ-context handoff, and real-time delivery. Advanced modules (bot flows, automation, campaigns) are UI+API shells not yet connected to runtime behaviour.
