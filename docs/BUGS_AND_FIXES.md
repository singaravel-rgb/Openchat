# OpenChat Defect & Remediation Log (Bugs and Fixes)

## Overview
This document records all defects identified during the release engineering audit, their root causes, the technical remediation applied, and the automated verification executed to confirm resolution.

---

### DEFECT-01: Super Admin Role Exclusion in Admin Workspace Routes
- **Severity**: Critical (P0)
- **Symptom**: Super Admin account `singaravel@vananam.com` experienced a blank white screen upon navigating to `/admin/conversations`, `/admin/conversations/[id]`, `/admin/settings`, `/admin/settings/notifications`, `/admin/settings/rules`, and `/admin/teams`.
- **Root Cause**: The client-side route guards strictly checked `if (!user || user.role !== 'admin') return null;`. Because the user's role is `super_admin`, this condition evaluated to true and returned null.
- **Files Modified**:
  - `frontend/src/app/admin/conversations/page.tsx`
  - `frontend/src/app/admin/conversations/[id]/page.tsx`
  - `frontend/src/app/admin/settings/notifications/page.tsx`
  - `frontend/src/app/admin/settings/page.tsx`
  - `frontend/src/app/admin/settings/rules/page.tsx`
  - `frontend/src/app/admin/teams/page.tsx`
- **Fix Applied**: Updated all route guards to:
  ```typescript
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;
  ```
- **Verification**: Verified via Playwright automated browser test (`test_widget_to_all_chats_e2e.py`); Super Admin successfully loads and manages conversations.

---

### DEFECT-02: Missing Background Polling in Workspace Conversation Feed
- **Severity**: High (P1)
- **Symptom**: New customer conversations submitted via the website widget did not appear in the Admin All Conversations list without a manual browser refresh.
- **Root Cause**: `ThreePanelWorkspace.tsx` only invoked `loadConversations()` once during initial component mount.
- **Files Modified**: `frontend/src/components/ThreePanelWorkspace.tsx`
- **Fix Applied**: Added a background timer interval to poll conversations every 4 seconds (`loadConversations(false, true)`) while preserving selected conversation state and avoiding scroll jumps.
- **Verification**: Verified in `test_widget_to_all_chats_e2e.py`; new customer conversations automatically appear in the workspace left panel within 4 seconds.

---

### DEFECT-03: Agent Inbox Queue Filter Mismatch
- **Severity**: High (P1)
- **Symptom**: When a conversation was escalated and assigned to an agent, it immediately disappeared from that agent's Inbox view.
- **Root Cause**: In `backend/app/services/conversation_service.py`, `queue == 'inbox'` strictly queried `[ConversationStatus.AI_HANDLING, ConversationStatus.PENDING]`. Once the conversation status changed to `'assigned'` or `'open'`, it fell outside the filter.
- **Files Modified**: `backend/app/services/conversation_service.py`
- **Fix Applied**: Updated `list_conversations_query` so `queue == 'inbox'` returns:
  1. Active conversations assigned to the viewing agent (`assigned`, `open`, `pending`, `ai_handling`, `waiting_on_customer`, `on_hold`).
  2. Active unassigned conversations awaiting pickup (`pending`, `ai_handling`, `open`).
- **Verification**: Verified via `debug_conversations_flow.py` and `test_widget_to_all_chats_e2e.py`.

---

### DEFECT-04: SQLAlchemy Circular / Standalone Import Failure on Message Model
- **Severity**: Medium (P2)
- **Symptom**: Standalone model queries on `Message` threw `sqlalchemy.exc.InvalidRequestError: When initializing mapper Mapper[Message(messages)], expression 'User' failed to locate a name ('User')`.
- **Root Cause**: `backend/app/models/message.py` defined `relationship("User")` without importing `User`.
- **Files Modified**: `backend/app/models/message.py`
- **Fix Applied**: Added `from app.models.user import User` to `message.py`.
- **Verification**: Verified via standalone database verification queries and Pytest suite.

---

### DEFECT-05: Missing Knowledge Base Content for The Reward Store
- **Severity**: High (P1)
- **Symptom**: AI responses lacked domain grounding for The Reward Store recharge rules, Forex conversion, and multi-wallet checkout.
- **Root Cause**: Knowledge base only contained initial generic stub articles.
- **Files Created**:
  - `scripts/import_rewardstore_kb.py`
  - `docs/therewardstore_kb_complete.json`
- **Fix Applied**: Scraped and ingested all 30 articles and 26 FAQs from `https://therewardstore.freshdesk.com/support/solutions` across 4 categories (`FAQ's - Recharges`, `FAQ's - Cart`, `FAQ's - Forex`, `Solutions`).
- **Verification**: Tested live with Gemini AI; questions on guest recharges and Forex fees now return high-confidence grounded answers with exact citations.

---

### DEFECT-06: Hardcoded Demo Accounts in Pytest Suite
- **Severity**: Medium (P2)
- **Symptom**: `test_phase2_widget.py` failed with HTTP 403 because demo credentials (`admin@demo.com`) were disabled for production safety.
- **Root Cause**: Test suite hardcoded legacy demo accounts rather than active test credentials.
- **Files Modified**: `backend/tests/test_phase2_widget.py`, `backend/tests/test_roles_and_access_control.py`
- **Fix Applied**: Updated test fixtures to use active credentials and dynamic timestamped invitation addresses.
- **Verification**: All 25 Pytests pass with 100% success.
