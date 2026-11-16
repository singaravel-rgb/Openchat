# OpenChat — System Architecture

**Repository:** C:\Users\SINGARAVEL\Documents\Freshchat\OpenChat  
**Stack:** FastAPI + SQLAlchemy + PostgreSQL + Redis + Next.js 16 + TypeScript + Tailwind CSS

---

## A. Frontend Architecture

### Technology Stack
- **Framework:** Next.js 16.4.5 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React hooks (useState, useEffect, useMemo)
- **HTTP Client:** Custom `fetchApi` wrapper in `frontend/src/lib/api.ts`

### Page Structure
```
frontend/src/app/
├── page.tsx                          # Home - role-based redirect
├── login/page.tsx                    # Customer/agent/admin login
├── register/page.tsx                 # Customer registration
├── help/page.tsx                     # Help & Support (FAQs + active conversations)
├── customer/page.tsx                 # Customer conversation workspace
├── agent/page.tsx                    # Agent inbox (AI handling + pending)
├── agent/assigned/page.tsx           # Agent assigned conversations
├── agent/pending/page.tsx            # Agent pending queue
├── agent/resolved/page.tsx           # Agent resolved conversations
├── agent/conversations/[id]/page.tsx # Agent conversation detail
├── admin/page.tsx                    # Admin dashboard
├── admin/conversations/page.tsx      # Admin all conversations (with filters)
├── admin/conversations/[id]/page.tsx # Admin conversation detail
├── admin/agents/page.tsx             # Agent management
├── admin/reports/page.tsx            # Reports & analytics (4 tabs)
├── admin/sla/page.tsx                # SLA configuration
├── admin/categories/page.tsx         # Knowledge base categories
├── admin/articles/page.tsx           # Knowledge base articles
├── admin/faqs/page.tsx               # Knowledge base FAQs
├── admin/settings/page.tsx           # General settings
├── admin/settings/notifications/page.tsx # Notification settings (tabs)
├── admin/settings/rules/page.tsx     # Assignment rules
├── admin/settings/widget/page.tsx    # Widget configuration
└── admin/settings/ai/page.tsx        # AI provider configuration
```

### Shared Components
```
frontend/src/components/
├── AgentLayout.tsx           # Shared layout for admin/agent (sidebar + header)
├── CustomerLayout.tsx        # Layout for customer pages
├── Sidebar.tsx               # Role-based navigation
├── ConversationList.tsx      # Conversation list with empty states
├── ConversationDetail.tsx    # Conversation detail view (messages + assignment timeline)
├── AssignmentTimeline.tsx    # Readable assignment history (replaces raw JSON)
├── Badge.tsx                 # Status/sender badges with variants
├── Button.tsx                # Reusable button component
├── Input.tsx                 # Text/input component
├── Textarea.tsx              # Multi-line input
├── Card.tsx                  # Card layout component
├── Avatar.tsx                # User avatar
├── NotificationBell.tsx      # Notification indicator
└── ...
```

### API Client Layer
`frontend/src/lib/api.ts` — Typed API client with:
- `authApi` — login, register, me
- `conversationApi` — customer conversation CRUD
- `agentApi` — agent queue management, take, assign, resolve, close, reopen
- `adminApi` — admin stats, conversations, agents, settings, AI, widget, SLA, reports, knowledge, audit logs, CSAT
- `customerApi` — customer help page, FAQs
- `widgetApi` — widget public config, session, messages
- `notificationApi` — notification CRUD

### Type Definitions
`frontend/src/lib/types.ts` — All TypeScript interfaces matching backend schemas.

---

## B. Backend Architecture

### Technology Stack
- **Framework:** FastAPI
- **Language:** Python 3.12
- **Database:** PostgreSQL (via SQLAlchemy 2.0+)
- **Cache/Queue:** Redis
- **Authentication:** JWT (PyJWT) + Argon2 password hashing
- **Background Tasks:** Celery + Celery Beat
- **Encryption:** Fernet (cryptography library)

### Directory Structure
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI app, middleware, router
│   ├── core/
│   │   ├── config.py               # Pydantic settings (env-based)
│   │   ├── security.py             # JWT, password hashing
│   │   ├── celery_app.py           # Celery app with beat schedule
│   │   └── redis.py                # Redis client
│   ├── api/
│   │   ├── v1/
│   │   │   ├── router.py           # All API routers registered
│   │   │   ├── auth.py             # Auth endpoints
│   │   │   ├── conversations.py    # Customer conversation API
│   │   │   ├── agent.py            # Agent workspace API
│   │   │   ├── admin.py            # Admin API (agents, settings, SLA, reports, etc.)
│   │   │   ├── admin_ai.py         # AI configuration API
│   │   │   ├── admin_knowledge.py  # Knowledge base API
│   │   │   ├── admin_settings.py   # Settings API (general/notifications/assignment)
│   │   │   ├── admin_widget.py     # Widget config API
│   │   │   ├── sla.py              # SLA configuration API
│   │   │   ├── reports.py          # Reports/analytics API
│   │   │   ├── widget.py           # Widget public API
│   │   │   ├── notifications.py    # Notification API
│   │   │   └── customer_knowledge.py # Customer-facing knowledge
│   │   └── dependencies.py         # Auth dependencies (get_current_user, require_roles, etc.)
│   ├── db/
│   │   ├── base.py                 # SQLAlchemy declarative base
│   │   └── session.py              # Database session
│   ├── models/
│   │   ├── user.py                 # User model
│   │   ├── agent_profile.py        # Agent profile (availability, capacity, approval)
│   │   ├── conversation.py         # Conversation model
│   │   ├── message.py              # Message model (with ai_metadata)
│   │   ├── csat.py                 # CSAT rating model
│   │   ├── audit_log.py            # Audit log model
│   │   ├── setting.py              # Settings model (key-value JSON)
│   │   ├── knowledge.py            # Category, Article, FAQ models
│   │   ├── notification.py         # Notification model
│   │   ├── widget.py               # WidgetConfig, WidgetSession models
│   │   └── ai.py                   # AIConfig, AIUsageLog models
│   ├── schemas/                    # Pydantic schemas for all models
│   ├── services/
│   │   ├── conversation_service.py # Conversation business logic + AI pipeline
│   │   ├── ai_service.py           # AI service (providers, knowledge, decisions)
│   │   ├── assignment_service.py   # Assignment engine
│   │   ├── sla_service.py          # SLA breach detection
│   │   ├── notification_service.py # Notification service
│   │   ├── email_service.py        # SMTP email service
│   │   ├── widget_service.py       # Widget service (rate limiting, sessions)
│   │   └── crypto.py               # Fernet encryption for API keys
│   ├── middleware/
│   │   ├── audit_log.py            # Audit log middleware
│   │   ├── rate_limit.py           # Rate limiting middleware
│   │   └── security_headers.py     # Security headers middleware
│   └── tasks/
│       └── sla_tasks.py            # Celery tasks (periodic SLA check)
├── migrations/                     # Alembic migrations (17 versions)
├── requirements.txt                # Python dependencies
└── tests/
    ├── test_phase1_conversations.py
    └── test_phase2_widget.py
```

---

## C. Database Relationships

```
users (id, email, password_hash, full_name, role, is_active, created_at)
├── agent_profiles (user_id FK, is_available, is_approved, max_conversations, active_conversations)
├── conversations (id, customer_id FK, assigned_agent_id FK, subject, status, channel, priority, tags, ...)
│   ├── messages (id, conversation_id FK, sender_id FK, sender_type, content, is_internal, client_message_id, ai_metadata, ...)
│   ├── csat_ratings (id, conversation_id FK, customer_id FK, rating, comment)
│   └── notification (id, user_id FK, type, priority, title, message, ...)
├── audit_logs (id, user_id FK, action, resource_type, resource_id, details, ip_address, ...)
├── settings (id, key, value JSON, category, description, ...)
├── sla_configs (id, name, response_time_minutes, resolution_time_minutes, is_default, is_active)
├── knowledge_categories (id, name, slug, description, parent_id FK, sort_order, is_active)
├── knowledge_articles (id, category_id FK, title, slug, content, status, sort_order, ...)
├── knowledge_faqs (id, category_id FK, question, answer, is_published, chat_action, sort_order, ...)
├── widget_configs (id, widget_title, brand_name, allowed_domains JSON, ...)
└── widget_sessions (id, token_hash, guest_id, customer_id FK, origin, expires_at, ...)
```

Key relationships:
- **User → Conversations** (customer_id): A customer owns their conversations
- **User → AgentProfile**: An agent has one profile with availability/capacity
- **Conversation → Messages**: One-to-many; messages have sender_type (customer/agent/ai/system)
- **Conversation → CSATRating**: One-to-one; customer rates resolved conversation
- **Conversation → AssignmentHistory**: JSON column on conversation; tracks assignment changes
- **Message → AI Metadata**: JSON column; stores AI decision, knowledge sources, usage/cost

---

## D. API Flow

### Authentication Flow
```
Client → POST /api/v1/auth/login → JWT token → Bearer token in Authorization header
```

### Conversation Flow (Customer)
```
Customer sends message
  → POST /api/v1/conversations/{id}/messages
  → conversation_service.process_customer_message()
  → process_ai_turn() → AI service generates response
  → AI message stored with ai_metadata
  → If handoff requested: conversation → pending
  → If assignment needed: assignment_service assigns to agent
  → Notification created for agent
  → Customer polls every 3s for updates
```

### Agent Flow
```
Agent views queue
  → GET /api/v1/agent/conversations?queue={inbox|pending|assigned|resolved}
Agent takes conversation
  → POST /api/v1/agent/conversations/{id}/take
Agent replies
  → POST /api/v1/agent/conversations/{id}/messages
Agent resolves
  → POST /api/v1/agent/conversations/{id}/resolve
```

### Admin Flow
```
Admin views stats
  → GET /api/v1/admin/stats
Admin manages agents
  → GET/POST/PATCH /api/v1/admin/agents/*
Admin configures settings
  → GET/PATCH /api/v1/admin/settings/{category}
Admin configures AI
  → GET/PUT /api/v1/admin/ai/config
  → POST /api/v1/admin/ai/test
Admin views reports
  → GET /api/v1/admin/reports/{overview|agents|time-series|knowledge}
```

### Widget Flow
```
Website loads embed.js
  → GET /api/v1/widget/embed.js
Widget gets public config
  → GET /api/v1/widget/config?origin={website}
Widget creates session
  → POST /api/v1/widget/session (origin validated)
Widget sends message
  → POST /api/v1/widget/conversations/{id}/messages
Widget polls for updates
  → GET /api/v1/widget/conversations/{id}/messages
```

---

## E. AI Processing Pipeline

```
Customer message
  → process_customer_message()
    → process_ai_turn()
      → RuntimeAIConfig (from AIConfig table)
      → Knowledge retrieval (retrieve_knowledge_hits)
        → Search FAQs + Articles by keyword
        → Score and rank results
      → Prompt construction (system + knowledge + conversation context)
      → Provider call (OpenAI / Anthropic / Demo)
      → Decision parsing (answer / clarify / abstain / escalate / handoff)
      → Prompt injection detection
      → Sensitive content detection
      → Complexity assessment
      → Usage/cost tracking (AIUsageLog)
      → AI message stored with ai_metadata
      → If handoff/escalate: conversation → pending; assignment triggered
```

### AI Decision Types

| Decision | Trigger | Action |
|----------|---------|--------|
| `answer` | Question answerable from knowledge | Respond with sources |
| `clarify` | Ambiguous or incomplete | Ask clarifying question |
| `abstain` | Cannot safely answer | Escalate to human queue |
| `escalate` | Sensitive or complex | Escalate with context |
| `handoff` | Explicit human request | Transfer to agent |

---

## F. Assignment Engine

```
assign_conversation_to_agent(conversation, agent_ids)
  → Filter available agents (is_available=true, is_approved=true)
  → Filter by capacity (active_conversations < max_conversations)
  → Sort by active_conversations ASC (lowest load first)
  → Select first agent
  → Increment agent.active_conversations
  → Record in assignment_history
  → Create notification for agent

process_pending_queue()
  → Get pending conversations ordered by created_at ASC (FIFO)
  → For each conversation, call assign_conversation_to_agent
  → Triggered when agent becomes available
```

---

## G. Background Jobs

### Celery Beat Schedule
| Task | Schedule | Purpose |
|------|----------|---------|
| `check_all_conversations_sla` | Every 60 seconds | Check SLA for all active conversations; detect breaches/warnings; create notifications |

### SLA Check Logic
```
check_all_conversations_sla(db)
  → For each active conversation with SLA config:
    → Calculate response_due_at and resolution_due_at
    → If approaching threshold: create SLA_WARNING notification
    → If breached: set breach flags; create SLA_BREACH notification
  → Return breach count
```

---

## H. Widget Architecture

### Components
1. **Embed Script** (`/api/v1/widget/embed.js`): Self-contained, loads widget on website
2. **Public Config** (`/api/v1/widget/config`): Returns widget configuration for validated origin
3. **Session Management** (`/api/v1/widget/session`): Creates guest or authenticated sessions
4. **Conversation API** (`/api/v1/widget/conversations/*`): Send/receive messages via widget

### Security Features
- **Origin Validation:** Only allowed origins can create sessions
- **Session Token Hashing:** SHA-256 hashed tokens stored in database
- **Session Expiration:** Configurable TTL; expired sessions rejected
- **Internal Note Privacy:** `is_internal` messages filtered from widget responses
- **Rate Limiting:** Per-IP rate limiting on widget endpoints

### Session Flow
```
Website loads → embed.js executes → GET /widget/config (origin validated)
  → POST /widget/session (creates session, returns token)
  → Customer sends message → POST /widget/conversations/{id}/messages
  → Widget polls → GET /widget/conversations/{id}/messages
  → Page refresh → Session token from localStorage → session restored
```

---

## I. Notifications and Integrations

### Notification Types
| Type | Trigger | Channel |
|------|---------|---------|
| `conversation_assigned` | Conversation assigned to agent | In-app + Email (if SMTP configured) |
| `conversation_resolved` | Conversation resolved | In-app |
| `new_message` | New message in conversation | In-app |
| `sla_warning` | SLA approaching breach | In-app + Email |
| `sla_breach` | SLA breached | In-app + Email |

### Integration Points
| Integration | Status | Configuration |
|-------------|--------|---------------|
| SMTP Email | Partial | `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password` in `.env` |
| OpenAI API | Partial | `OPENAI_API_KEY` in `.env` |
| Anthropic API | Partial | `ANTHROPIC_API_KEY` in `.env` |
| Redis | Required | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` in `.env` |
| PostgreSQL | Required | `POSTGRES_*` in `.env` |

---

## J. Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `POSTGRES_DB` | — | Yes |
| `POSTGRES_USER` | — | Yes |
| `POSTGRES_PASSWORD` | — | Yes |
| `POSTGRES_HOST` | 127.0.0.1 | Yes |
| `POSTGRES_PORT` | 5434 | Yes |
| `REDIS_HOST` | 127.0.0.1 | Yes |
| `REDIS_PORT` | 6379 | Yes |
| `REDIS_PASSWORD` | — | Yes |
| `SECRET_KEY` | — | Yes (JWT signing) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | No |
| `AI_PROVIDER` | demo | No |
| `OPENAI_API_KEY` | — | Only for OpenAI provider |
| `ANTHROPIC_API_KEY` | — | Only for Anthropic provider |
| `SMTP_HOST` | localhost | Only for email |
| `SMTP_PORT` | 587 | Only for email |
| `SMTP_USER` | — | Only for email |
| `SMTP_PASSWORD` | — | Only for email |
| `CORS_ORIGINS` | http://localhost:3000, http://127.0.0.1:3000 | No |
