# OpenChat Existing System Audit Report

**Date:** 2026-11-16  
**Auditor:** Kilo Code Assistant  
**Project:** OpenChat - AI-Powered Customer Support Platform

---

## 1. Executive Summary

OpenChat is a comprehensive, production-ready customer support platform built with modern technologies. It features:

- **Multi-role architecture**: Customer, Agent, Admin portals with role-based access control
- **AI-first conversation handling**: Conversations start in AI_HANDLING status with intelligent responses grounded in knowledge base
- **Complete agent workspace**: Three-panel layout (conversation list, message thread, details) with real-time capabilities
- **Admin dashboard**: Full oversight of conversations, agents, analytics, SLA, knowledge base, and system settings
- **Embeddable widget**: Self-contained JavaScript widget for website integration
- **Extensibility**: Webhooks, automation rules, bot flows, custom fields, campaigns

**Overall Assessment**: Well-architected, feature-complete platform with strong separation of concerns. Ready for production use with some areas for improvement identified below.

---

## 2. Technology Stack

### Backend
| Component | Technology |
|-----------|------------|
| Framework | FastAPI (Python 3.11+) |
| ORM | SQLAlchemy 2.0 with async support |
| Database | PostgreSQL (with Alembic migrations) |
| Authentication | JWT (RS256/HS256) with OAuth2PasswordBearer |
| Task Queue | Celery + Redis |
| AI Providers | OpenAI, Anthropic, Demo (fallback) |
| Testing | pytest + TestClient |
| Code Quality | ruff, mypy |

### Frontend
| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Custom Components |
| State Management | React Hooks (useState, useEffect, useMemo) |
| Real-time | Polling (3-15s intervals) |
| Date Handling | date-fns |
| Forms | Custom components with native validation |

### Infrastructure
- Docker Compose for local development
- Environment-based configuration (.env)
- CORS configured for widget embedding

---

## 3. Database Schema (25+ Tables)

### Core Tables
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | All users (customer, agent, admin) | id, email, full_name, role, is_active, password_hash |
| `conversations` | Conversation lifecycle | id, customer_id, assigned_agent_id, sla_config_id, subject, status, channel, priority, tags, assignment_history, SLA fields |
| `messages` | Message thread | id, conversation_id, sender_id, sender_type, message_type, content, is_internal, client_message_id, ai_metadata |
| `agent_profiles` | Agent capacity & availability | user_id, is_approved, is_available, max_conversations, active_conversations |
| `sla_configs` | SLA definitions | name, response_time_minutes, resolution_time_minutes, is_default |

### Knowledge Base
| Table | Purpose |
|-------|---------|
| `categories` | Hierarchical categories for articles/FAQs |
| `articles` | Knowledge base articles with versioning |
| `faqs` | Frequently asked questions |

### Extensibility
| Table | Purpose |
|-------|---------|
| `webhooks` | Outbound event notifications |
| `automation_rules` | Event-driven automation (trigger + conditions + actions) |
| `bot_flows` | Visual chatbot flow builder |
| `custom_fields` | Dynamic conversation fields |
| `canned_responses` | Pre-written agent responses |
| `campaigns` | Outbound messaging campaigns |
| `teams` / `departments` | Agent organization |
| `business_hours` / `holidays` | Operating hours for SLA |
| `notifications` | In-app notification system |
| `ai_configs` / `ai_usage_logs` | AI configuration & cost tracking |
| `csat_ratings` | Customer satisfaction scores |
| `audit_logs` | Admin action audit trail |
| `attachments` | File uploads |
| `settings` | System-wide key-value settings |

### Key Indexes (Performance)
- `conversations`: status+created_at, sla_response_due, sla_resolution_due, priority, assigned_agent_id+status
- `messages`: client_message_id, conversation_id+created_at

---

## 4. API Endpoints (50+ Routes)

### Authentication (`/api/v1/auth`)
- `POST /login` - OAuth2 password flow
- `POST /register` - Customer self-registration
- `POST /refresh` - Token refresh
- `GET /me` - Current user profile

### Conversation Lifecycle (`/api/v1/conversations` - Customer)
- `POST /` - Create conversation (status: AI_HANDLING)
- `GET /` - List customer's conversations
- `GET /{id}` - Get conversation with messages
- `POST /{id}/messages` - Send message (triggers AI response)
- `PATCH /{id}` - Update subject (customer only)
- `POST /{id}/reopen` - Reopen resolved/closed
- `POST /{id}/csat` - Submit CSAT rating

### Agent Workspace (`/api/v1/agent`)
- `GET /conversations` - Queue-based listing (inbox/pending/assigned/resolved)
- `GET /conversations/{id}` - Full conversation detail
- `POST /conversations/{id}/messages` - Send agent message (auto-takes if in queue)
- `POST /conversations/{id}/take` - Self-assign from queue
- `POST /conversations/{id}/assign` - Assign (admin) or self-assign (agent)
- `PATCH /conversations/{id}` - Update priority/tags/subject
- `POST /conversations/{id}/resolve` - Resolve with details
- `POST /conversations/{id}/close` - Close
- `POST /conversations/{id}/reopen` - Reopen
- `GET /workload` - Current agent capacity
- `PATCH /availability` - Toggle availability
- `GET /agents` - List agents for assignment

### Admin Workspace (`/api/v1/admin`)
- `GET /stats` - Dashboard metrics
- `GET /agents` - Full agent management (approve/reject/availability/max)
- `GET /conversations` - All conversations with filters
- `GET /conversations/{id}` - Full detail with all messages
- `PATCH /conversations/{id}` - Update any property
- `POST /conversations/{id}/assign` - Assign to any agent
- `POST /conversations/{id}/status` - Force status transition
- `POST /conversations/{id}/messages` - Send as admin
- `GET /csat` - CSAT metrics
- `GET /audit-logs` - Admin action audit

### Knowledge Base
- `GET /admin/categories` - Category tree management
- `GET /admin/articles` - Article CRUD + publish/archive
- `GET /admin/faqs` - FAQ management
- `GET /customer/knowledge/*` - Public read-only access

### AI Configuration (`/api/v1/admin/ai`)
- `GET /` - Get config (with masked keys)
- `PATCH /` - Update provider/model/keys/instructions
- `POST /test` - Test provider connectivity
- `GET /usage` - Token usage & cost tracking

### Settings (`/api/v1/admin/settings`)
- `GET /` - General settings
- `GET /widget` - Widget configuration
- `GET /rules` - Assignment rules
- `GET /notifications` - Notification preferences

### SLA & Reports
- `GET /admin/sla` - SLA configs
- `GET /admin/reports` - Analytics with time-series
- `POST /admin/reports/export` - CSV/JSON export

### Widget API (`/api/v1/widget`)
- `GET /config` - Public widget config
- `POST /session` - Create/restore guest session
- `POST /conversations` - Create conversation with optional initial message
- `POST /conversations/{id}/messages` - Send message
- `POST /conversations/{id}/request-human` - Handoff to queue
- `GET /embed.js` - Self-contained embeddable widget

### Extensibility
- Webhooks: CRUD + test delivery + delivery logs
- Automation Rules: CRUD + execution history
- Bot Flows: Versioned flow builder with steps/issues
- Custom Fields: Dynamic conversation fields
- Canned Responses: Agent productivity
- Campaigns: Outbound messaging with targeting
- Teams/Departments: Agent organization
- Business Hours: SLA calendar

---

## 5. User Workflows

### 5.1 Customer Journey
```
1. Customer visits website → Widget loads (/widget/embed.js)
2. Customer clicks launcher → Creates session (guest or authenticated)
3. Customer starts conversation → POST /widget/conversations (status: AI_HANDLING)
4. AI responds using knowledge base (FAQs + Articles)
5. If AI cannot answer confidently → Escalates to PENDING queue
6. Agent takes conversation → Status: ASSIGNED
7. Agent resolves → Status: RESOLVED
8. Customer can reopen or submit CSAT
```

### 5.2 Agent Journey
```
1. Agent logs in → Lands on /agent (Inbox = AI_HANDLING + PENDING)
2. Agent sees conversation in queue → Clicks "Take" or auto-assigned
3. Agent replies → Customer notified via widget/email
4. Agent uses canned responses, internal notes, custom fields
5. Agent resolves/closes → Conversation moves to Resolved queue
6. Agent monitors workload via /workload endpoint
```

### 5.3 Admin Journey
```
1. Admin logs in → Dashboard with real-time stats (30s refresh)
2. Admin manages agents (approve, set availability, capacity)
3. Admin oversees all conversations with advanced filters
4. Admin configures AI (provider, model, knowledge sources, escalation rules)
5. Admin sets up SLA, webhooks, automation, bot flows
6. Admin views reports/analytics and exports data
```

### 5.4 AI Conversation Flow
```
Customer Message Received
       │
       ▼
┌─────────────────────┐
│ AI Enabled?         │──No──▶ Escalate to PENDING (human queue)
└─────────┬───────────┘
          │ Yes
          ▼
┌─────────────────────┐
│ Prompt Injection?   │──Yes──▶ Safe response + escalate if sensitive
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ Explicit Human      │──Yes──▶ "Connecting you..." + PENDING
│ Request?            │
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ Sensitive Topic?    │──Yes──▶ "Requires human..." + PENDING
│ (billing, legal,    │
│  security, etc.)    │
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ Retrieve Knowledge  │◄── Search FAQs + Articles
│ (semantic token     │
│  matching)          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Call Provider       │──OpenAI/Anthropic/Demo
│ (with context +     │
│  knowledge)         │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Validate Output     │──No knowledge + no "clarify" → Force abstain
│ (grounding check)   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Confidence ≥        │──No + escalate_on_uncertain ──▶ PENDING
│ Threshold?          │
└─────────┬───────────┘
          │ Yes
          ▼
    AI Response Sent
    (with source citations)
```

### 5.5 Agent Assignment Logic
```
Conversation Created (AI_HANDLING)
       │
       ▼
AI Responds / Escalates
       │
       ▼
Status: PENDING (no agent available) or ASSIGNED (agent available)
       │
       ▼
┌─────────────────────┐
│ assign_conversation_to_agent()
│ 1. Get available agents (is_available + active < max)
│ 2. Sort by active_conversations ASC, user_id ASC
│ 3. Assign to first agent
│ 4. Increment agent_profile.active_conversations
│ 5. Create system message + notification
└─────────┬───────────┘
          │
          ▼
    If no agent available → Status stays PENDING
    
    When agent becomes available:
    set_agent_availability() → process_pending_queue()
    FIFO assignment from oldest PENDING
```

---

## 6. UI/UX Audit

### 6.1 Layout Architecture
- **Three-Panel Workspace** (Agent/Admin):
  - Left (320px): Conversation list with queue selector, search, filters
  - Center (flex-1): Message thread with composer
  - Right (320px): Conversation details (customer info, properties, custom fields, attachments)
  - Collapsible panels, mobile-responsive (right panel as drawer)

- **Customer Portal**:
  - Single-column chat view with sidebar conversation list
  - Modal for new conversation creation
  - Real-time polling (15s) for new messages

### 6.2 Navigation
- **Sidebar** (shared Agent/Admin): Role-filtered navigation groups
  - Agent: Inbox, Pending, Assigned, Resolved
  - Admin: Dashboard, Workspace, Knowledge Base, Analytics, Settings
- **Collapsible** with auto-expand for active route
- **Badges** for unread counts on queues

### 6.3 Components
| Component | Usage |
|-----------|-------|
| `Button` | Primary, outline, ghost, danger variants; loading states |
| `Input` / `Textarea` | Forms with validation, dark mode |
| `Card` | Content containers |
| `Badge` | Status/priority indicators (success/warning/danger/info) |
| `Avatar` | User initials with role-based colors |
| `Sidebar` | Navigation with nested groups |
| `NotificationBell` | In-app notifications dropdown |
| `ThreePanelWorkspace` | Core agent/admin workspace |

### 6.4 Dark Mode
- Full Tailwind dark mode support (`dark:` prefix)
- Persisted via CSS media query (no localStorage toggle found)

### 6.5 Accessibility
- ARIA labels on interactive elements
- Semantic HTML structure
- Focus management in modals
- Live regions for message updates
- Keyboard navigation support

---

## 7. Key Technical Patterns

### 7.1 Conversation Status Machine
```python
ALLOWED_TRANSITIONS = {
    AI_HANDLING: {ASSIGNED, PENDING, RESOLVED, CLOSED},
    PENDING:     {ASSIGNED, AI_HANDLING, RESOLVED, CLOSED},
    ASSIGNED:    {PENDING, RESOLVED, CLOSED, AI_HANDLING},
    RESOLVED:    {PENDING, CLOSED, ASSIGNED},
    CLOSED:      {PENDING},  # Only reopen to pending
}
```
Enforced in `conversation_service.transition_status()` with HTTP 409 on invalid transitions.

### 7.2 Message Visibility Control
- Customers: `Message.is_internal == False` only
- Agents/Admins: All messages including internal notes
- Enforced in `get_visible_messages()` and API endpoints

### 7.3 Idempotency
- `client_message_id` on message create
- Checked in agent/admin/widget endpoints before insert
- Prevents duplicate messages on retry

### 7.4 Capacity-Based Assignment
- `AgentProfile.max_conversations` (default 5, configurable)
- `AgentProfile.active_conversations` tracked in real-time
- Auto-release on resolve/close/reassign
- `process_pending_queue()` runs when agent becomes available

### 7.5 AI Grounding & Safety
- Knowledge retrieval via token overlap scoring
- Output validation: prevents fabricated facts, false resolution claims
- Prompt injection detection (regex patterns)
- Sensitive topic escalation (billing, legal, security, PII)
- Explicit human request detection
- Turn limit safeguard (configurable max AI turns)

### 7.6 SLA Tracking
- `sla_response_due_at` / `sla_resolution_due_at` on conversation
- Background task (`sla_tasks.py`) monitors breaches
- Breach notifications via `NotificationType.SLA_WARNING/BREACH`
- Admin dashboard shows SLA status per conversation

---

## 8. Identified Technical Problems & Risks

### 8.1 High Priority

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **No WebSocket/Real-time** | Frontend polling (3-15s) | Delayed message delivery, high server load | Add WebSocket/SSE for live updates; use polling as fallback |
| **No Rate Limiting on Auth** | `auth/login` endpoint | Brute-force vulnerability | Add strict rate limiting (5 req/min per IP) |
| **Demo AI as Fallback** | `ai_service.py:_call_demo()` | Silent fallback to deterministic responses | Add alerting when demo provider used in production |
| **No Conversation Locking** | Concurrent agent actions | Race conditions on take/assign | Add row-level locking or optimistic concurrency |
| **Hardcoded PRICING_RATES** | `ai_service.py:62-69` | Stale cost estimates | Move to config/db; auto-update via provider APIs |

### 8.2 Medium Priority

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Large ThreePanelWorkspace** | `ThreePanelWorkspace.tsx` (1000+ lines) | Maintenance burden | Split into sub-components: ConversationList, MessageThread, DetailPanel, Composer |
| **Polling on Every Page** | `CustomerPage` (15s), `ThreePanelWorkspace` (30s stats) | Unnecessary load when tab inactive | Use Page Visibility API to pause polling |
| **No Optimistic UI for Agent Actions** | Assign/resolve/take | Perceived latency | Add optimistic updates with rollback on error |
| **Inconsistent Error Handling** | Various API endpoints | Poor DX, hard to debug | Standardize error response format; add error codes |
| **Missing Pagination on Some Lists** | Admin agents, conversations | Performance with large datasets | Ensure all list endpoints support limit/offset |
| **Widget Session in localStorage** | `embed.js` | XSS risk if widget compromised | Use httpOnly cookies for session; CSP headers |
| **No API Versioning Strategy** | `/api/v1/` prefix only | Breaking changes risk | Document deprecation policy; consider header-based versioning |

### 8.3 Low Priority / Technical Debt

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Magic Strings for Status** | Multiple files | Use `ConversationStatus` enum everywhere |
| **Duplicate Agent Listing Logic** | `agent.py:312-344`, `admin.py:108-136` | Extract to shared service |
| **No OpenAPI Examples** | Schema definitions | Add `example` fields for better docs |
| **Inline SVG Icons** | `Sidebar.tsx:258-399` | Extract to icon library/component |
| **No Request Validation Middleware** | Global | Add Pydantic validation for all inputs |
| **Celery Tasks Not Visible** | `sla_tasks.py` | Add Flower or custom monitoring |

---

## 9. Security Assessment

### Strengths
- JWT with configurable secret/algorithm
- Role-based access control (RBAC) on all endpoints
- Password hashing (bcrypt via passlib)
- API key encryption at rest (AES-GCM via `crypto.py`)
- CORS restricted to configured origins
- Security headers middleware (CSP, HSTS, etc.)
- Rate limiting middleware (per-endpoint)
- Audit logging for admin actions
- Input sanitization in AI service

### Concerns
1. **Widget Session Token in localStorage** - Vulnerable to XSS
2. **No MFA/2FA Support** - Admin/agent accounts only protected by password
3. **Password Reset Not Implemented** - No "forgot password" flow
4. **Session Expiry Only on Token** - No sliding session / activity tracking
5. **Widget Origin Validation** - Relies on `Referer`/`Origin` headers (spoofable)

---

## 10. Testing Coverage

### Existing Tests
| File | Coverage |
|------|----------|
| `test_phase1_conversations.py` | Conversation CRUD, visibility, idempotency, internal notes, resolve/reopen, admin ops |
| `test_phase2_widget.py` | Widget session, conversation, messages, human handoff, config |

### Gaps
- No integration tests for AI service
- No tests for assignment service edge cases
- No tests for SLA breach detection
- No tests for automation rules engine
- No E2E tests (Playwright/Cypress)
- No load/performance tests
- No security scanning in CI

---

## 11. Deployment & Operations

### Current State
- Docker Compose for local dev (`docker-compose.yml` not shown but implied)
- Alembic for migrations (`alembic upgrade head`)
- Environment variables for all secrets
- Celery worker for background tasks (SLA, notifications, etc.)

### Missing
- Production Dockerfile
- Kubernetes manifests / Helm charts
- Health check endpoints (`/health` exists but basic)
- Structured logging (JSON format)
- Distributed tracing (OpenTelemetry)
- Backup/restore procedures
- Disaster recovery plan

---

## 12. Recommendations Summary

### Immediate (Week 1-2)
1. [ ] Add WebSocket/SSE for real-time message delivery
2. [ ] Implement rate limiting on `/auth/login`
3. [ ] Add alerting when demo AI provider is active
4. [ ] Implement row-level locking for conversation mutations
5. [ ] Move AI pricing to configurable settings

### Short-term (Month 1)
1. [ ] Refactor `ThreePanelWorkspace` into smaller components
2. [ ] Add Page Visibility API to pause background polling
3. [ ] Implement optimistic UI for agent actions
4. [ ] Standardize error response format with error codes
5. [ ] Switch widget session to httpOnly cookies + CSP
6. [ ] Add password reset flow
7. [ ] Add MFA support for admin/agent roles

### Medium-term (Quarter 1)
1. [ ] Implement API versioning strategy with deprecation policy
2. [ ] Add OpenTelemetry distributed tracing
3. [ ] Build E2E test suite (Playwright)
4. [ ] Add load testing to CI pipeline
5. [ ] Implement conversation search (full-text)
6. [ ] Add conversation merging/splitting
7. [ ] Build admin UI for automation rules (visual builder)

### Long-term (Quarter 2+)
1. [ ] Multi-language support (i18n) for UI
2. [ ] Advanced AI: conversation summarization, suggested replies
3. [ ] Custom widget theming per brand
4. [ ] Marketplace for integrations (Slack, Jira, etc.)
5. [ ] Advanced analytics: cohort analysis, agent performance trends

---

## 13. Appendix: File Structure

```
OpenChat/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # 25+ route modules
│   │   ├── core/             # Config, security, enums, crypto
│   │   ├── db/               # Session, base model
│   │   ├── models/           # 18 SQLAlchemy models
│   │   ├── schemas/          # 20+ Pydantic schemas
│   │   ├── services/         # 10+ business logic services
│   │   ├── tasks/            # Celery tasks (SLA)
│   │   ├── middleware/       # Auth, rate limit, audit, security
│   │   └── main.py           # FastAPI app factory
│   ├── tests/                # pytest tests
│   └── migrations/           # 25+ Alembic versions
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages
│   │   │   ├── admin/        # 18 admin pages
│   │   │   ├── agent/        # 5 agent pages
│   │   │   ├── customer/     # Customer portal
│   │   │   ├── login/        # Auth page
│   │   │   └── register/     # Registration
│   │   ├── components/       # 20+ reusable components
│   │   ├── context/          # AuthContext
│   │   ├── lib/              # API client, types, utils
│   │   └── hooks/            # Custom React hooks
│   └── package.json
└── docs/                     # This audit report
```

---

**End of Audit Report**