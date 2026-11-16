# OpenChat — End-to-End Workflows

Complete workflow documentation for all critical business processes.

---

## Workflow 1: Complete Customer Journey

**Customer → AI → Agent → Resolution**

| Step | Customer Action | Backend Processing | AI Processing | Database State | Result |
|------|----------------|-------------------|---------------|----------------|--------|
| 1 | Customer logs in | JWT validation | — | Session: active | PASS |
| 2 | Customer starts conversation | POST `/api/v1/conversations` | — | Conversation: `pending` | PASS |
| 3 | Customer sends message | POST messages → `process_customer_message` → `process_ai_turn` | Demo provider processes; knowledge retrieval with scoring | Message: `customer` + `ai`; `ai_metadata` stored | PASS |
| 4 | AI responds | AI message saved with metadata | Knowledge retrieval: searches FAQs/articles; response grounded | Message: `ai` with `ai_metadata` (sources, confidence) | PASS |
| 5 | Customer requests human | Same as step 3 | `detect_explicit_human_request` matches keywords | Conversation: `pending` | PASS |
| 6 | Assignment engine | `assign_conversation_to_agent` picks lowest capacity available agent | — | Conversation: `assigned`; `assignment_history` recorded | PASS |
| 7 | Agent notified | `create_notification` with `conversation_assigned` | — | Notification: created | PASS |
| 8 | Agent opens conversation | GET conversation detail | — | Messages: full history visible | PASS |
| 9 | Agent sends public reply | POST messages | — | Message: `agent` (public) | PASS |
| 10 | Customer receives reply | Customer polls every 3s | — | Customer sees agent reply | PASS |
| 11 | Agent adds internal note | POST with `is_internal=true` | — | Message: `agent`, `is_internal=true` | PASS |
| 12 | Customer views conversation | GET filters `is_internal=False` for customers | — | Customer cannot see internal note | PASS |
| 13 | Agent resolves | POST resolve | — | Conversation: `resolved`; `resolved_at` set | PASS |
| 14 | Customer rates CSAT | POST `/api/v1/conversations/{id}/csat` (1-5) | — | CSATRating: created | PASS |

**Result: All 14 steps verified via E2E API tests.**

---

## Workflow 2: AI Journey with Knowledge Retrieval

**AI-First Processing**

| Step | Trigger | Backend | AI | Result |
|------|---------|---------|-----|--------|
| 1 | Customer sends message | `process_customer_message` → `process_ai_turn` | Demo provider generates response | AI responds; message stored |
| 2 | AI searches knowledge | `retrieve_knowledge_hits` — keyword matching | Knowledge hits scored and ranked | Sources attached to `ai_metadata` |
| 3 | AI generates response | Structured decision: answer/clarify/abstain/escalate/handoff | Demo provider produces text | Response saved; sources referenced |
| 4 | AI cannot resolve | Decision = `abstain` or `should_escalate` | — | Conversation → `pending` |
| 5 | Explicit human request | `detect_explicit_human_request` | — | Conversation → `pending`; assignment triggered |
| 6 | Complex/sensitive/uncertain | Escalation rules evaluated | — | Conversation escalated to agent queue |
| 7 | Human takeover | Agent takes over | AI stops responding | Agent has full context; AI silent |

**AI Decision Logic:**
- `answer`: Question answerable from knowledge → Respond with sources
- `clarify`: Ambiguous/incomplete → Ask clarifying question
- `abstain`: Cannot safely answer → Escalate to human queue
- `escalate`: Sensitive/complex → Escalate with context
- `handoff`: Explicit human request → Transfer to agent

**Provider Status:** Demo (working), OpenAI (adapter ready, needs API key), Anthropic (adapter ready, needs API key)

---

## Workflow 3: Human Handoff

**AI Cannot Resolve → Queue → Agent Assignment → Agent Replies**

| Step | Action | API Endpoint | Result |
|------|--------|--------------|--------|
| 1 | Customer requests human | POST `/api/v1/conversations/{id}/messages` | Handoff detected; conversation → `pending` |
| 2 | Assignment engine | `assign_conversation_to_agent` | Agent selected by lowest capacity |
| 3 | Agent notified | POST `/api/v1/notifications` | Notification created |
| 4 | Agent opens conversation | GET `/api/v1/agent/conversations/{id}` | Full context + message history |
| 5 | Agent takes conversation | POST `/api/v1/agent/conversations/{id}/take` | Conversation → `assigned` |
| 6 | Agent replies | POST `/api/v1/agent/conversations/{id}/messages` | Public message saved |
| 7 | Customer receives reply | Polling GET `/api/v1/conversations/{id}` | Customer sees reply |
| 8 | Agent resolves | POST `/api/v1/agent/conversations/{id}/resolve` | Conversation → `resolved` |

**Result: All handoff steps verified.**

---

## Workflow 4: Agent Workflow

**Agent Daily Operations**

| Step | Action | API Endpoint | Result |
|------|--------|--------------|--------|
| 1 | Agent logs in | POST `/api/v1/auth/login` | JWT issued |
| 2 | Agent views inbox | GET `/api/v1/agent/conversations?queue=inbox` | AI_HANDLING + PENDING |
| 3 | Agent views assigned | GET `/api/v1/agent/conversations?queue=assigned` | Agent's assigned |
| 4 | Agent views pending | GET `/api/v1/agent/conversations?queue=pending` | All pending |
| 5 | Agent takes conversation | POST `/api/v1/agent/conversations/{id}/take` | Assigned to agent |
| 6 | Agent sets availability | PATCH `/api/v1/agent/availability?is_available=true` | Agent marked available |
| 7 | Agent sends public reply | POST `/api/v1/agent/conversations/{id}/messages` | Public message visible |
| 8 | Agent adds internal note | POST with `is_internal=true` | Hidden from customer |
| 9 | Agent resolves | POST `/api/v1/agent/conversations/{id}/resolve` | → `resolved` |
| 10 | Agent reopens | POST `/api/v1/agent/conversations/{id}/reopen` | → `pending` |

**Result: All agent workflow steps verified.**

---

## Workflow 5: Admin Workflow

**Administrative Operations**

| Step | Action | API Endpoint | Result |
|------|--------|--------------|--------|
| 1 | Admin logs in | POST `/api/v1/auth/login` | JWT issued |
| 2 | Admin views dashboard | GET `/api/v1/admin/stats` | All metrics |
| 3 | Admin views all conversations | GET `/api/v1/admin/conversations` | Full list with filters |
| 4 | Admin manages agents | GET `/api/v1/admin/agents` | Agent list with workload |
| 5 | Admin approves agent | POST `/api/v1/admin/agents/{id}/approve` | `is_approved=true` |
| 6 | Admin rejects agent | POST `/api/v1/admin/agents/{id}/reject` | `is_active=false` |
| 7 | Admin configures AI | GET/PUT `/api/v1/admin/ai/config` | Settings persisted |
| 8 | Admin configures widget | GET/PUT `/api/v1/admin/widget/config` | Settings persisted |
| 9 | Admin manages knowledge | POST/PUT/DELETE `/api/v1/admin/knowledge/*` | CRUD operations |
| 10 | Admin configures SLA | POST/PUT/DELETE `/api/v1/admin/sla/configs` | Rules persisted |
| 11 | Admin views reports | GET `/api/v1/admin/reports/overview` | Metrics and analytics |
| 12 | Admin views audit logs | GET `/api/v1/admin/audit-logs` | Admin action history |
| 13 | Admin views CSAT | GET `/api/v1/admin/csat` | Satisfaction metrics |

**Result: All admin workflow steps verified.**

---

## Workflow 6: Assignment and SLA

**Assignment Rules**

| Rule | Behavior | Verified |
|------|----------|----------|
| Lowest active-chat | Agent with fewest active conversations | PASS |
| Capacity limit | Agent at `max_conversations` not assigned | PASS |
| All at capacity | Conversation enters `pending` | PASS |
| FIFO pending | Oldest pending assigned first | PASS |
| Agent goes offline | New conversations skip unavailable agent | PASS |
| Agent comes online | Pending queue processed; assignment occurs | PASS |
| Manual assignment | Admin overrides auto-assignment | PASS |
| Reassignment | Conversation moved to different agent | PASS |

**SLA Processing**

| Step | Action | Result |
|------|--------|--------|
| SLA config created | POST `/api/v1/admin/sla/configs` | Persisted |
| Conversation created | `apply_sla_to_conversation` sets due dates | Due dates calculated |
| Warning threshold | 15min before response SLA; 30min before resolution | `SLA_WARNING` notification |
| Breach detected | Past due | `SLA_BREACH` notification; flags set |
| Automated check | Celery beat every 60s | Breaches detected automatically |
| Manual check | POST `/api/v1/admin/sla/check-all` | Immediate breach check |

**Result: All assignment and SLA logic verified.**

---

## Workflow 7: Widget Integration

**Embeddable Customer-Facing Widget**

| Step | Action | Result |
|------|--------|--------|
| 1 | Admin configures widget | PUT `/api/v1/admin/widget/config` |
| 2 | Admin gets embed snippet | GET `/api/v1/widget/embed.js` |
| 3 | Widget loads on website | `<script src="{backend}/api/v1/widget/embed.js">` |
| 4 | Launcher appears | Floating button visible |
| 5 | Customer opens widget | Widget window opens; session created |
| 6 | Guest session | POST `/api/v1/widget/session`; token returned |
| 7 | Customer sends message | Widget POST messages |
| 8 | AI responds | Demo provider generates response |
| 9 | Human handoff | Customer requests human; → `pending`; agent assigned |
| 10 | Agent replies | Agent message appears in widget |
| 11 | Page refresh | Session token restored from localStorage |
| 12 | Invalid session | Session rejected; new session created |
| 13 | Disallowed origin | Origin validation rejects; 403 returned |
| 14 | Internal notes | Never exposed in widget responses |

**Result: All widget workflow steps verified.**

---

## Workflow 8: Campaigns and Proactive Messaging

**Admin-Driven Campaigns**

| Step | Action | Result |
|------|--------|--------|
| 1 | Admin creates campaign | POST `/api/v1/admin/campaigns` |
| 2 | Admin configures message template | Template with `{{customer_name}}` placeholders |
| 3 | Admin defines target criteria | JSON criteria for customer selection |
| 4 | Admin launches campaign | POST `/api/v1/admin/campaigns/{id}/launch` |
| 5 | Messages sent | One message per target customer |
| 6 | Delivery tracked | `campaign_messages` table records status |
| 7 | Admin reviews results | GET `/api/v1/admin/campaigns/{id}/messages` |

**Result: Campaign workflow verified via API.**

---

## Workflow 9: File Attachments

**Customer/Agent File Sharing**

| Step | Action | Result |
|------|--------|--------|
| 1 | Customer/agent uploads file | POST `/api/v1/attachments/upload` |
| 2 | File stored | File saved to disk, metadata in DB |
| 3 | File listed | GET `/api/v1/attachments/conversation/{id}` |
| 4 | File downloaded | GET `/api/v1/attachments/{id}/download` |
| 5 | File deleted | DELETE `/api/v1/attachments/{id}` (owner/admin only) |

**Result: File attachment workflow verified via API.**

---

## Workflow 10: Automation Rules

**Rule-Based Automation**

| Step | Action | Result |
|------|--------|--------|
| 1 | Admin creates rule | POST `/api/v1/admin/automation-rules` |
| 2 | Rule triggered | Event matches trigger (conversation.created, message.created, etc.) |
| 3 | Conditions evaluated | AND logic across all conditions |
| 4 | Actions executed | Assign, status change, notification, tags, priority |
| 5 | Execution logged | `automation_rule_executions` table records result |

**Result: Automation rule workflow verified via API.**
