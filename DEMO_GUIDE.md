# OpenChat Demo Guide

## Overview
This guide covers the complete end-to-end demo journey for OpenChat, demonstrating the three core components:
1. **Admin Portal** - Configuration and oversight
2. **Agent Portal** - Conversation management and replies
3. **Embedded Customer Chat Widget** - Guest sessions on external websites

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | demo1234 |
| Agent | agent@demo.com | demo1234 |
| Customer (portal) | customer@demo.com | demo1234 |

## Services

- **Backend API**: http://127.0.0.1:8000
- **Frontend**: http://localhost:3000
- **Widget Embed Script**: http://127.0.0.1:8000/api/v1/widget/embed.js

## 12-Step Demo Journey

### Phase 1: Admin Configuration (1-2)

**Step 1: Login as Admin**
1. Open http://localhost:3000/login
2. Login with `admin@demo.com` / `demo1234`
3. Redirected to `/admin` dashboard

**Step 2: Configure Chat Widget**
1. Navigate to **Settings → Chat Widget Configuration** (`/admin/settings/widget`)
2. Verify settings:
   - **Widget Visible**: ✅ ON
   - **Widget Available**: ✅ ON
   - **Primary Color**: `#2563eb` (blue)
   - **Launcher Position**: Bottom Right
   - **Welcome Message**: "Hi! How can we help you today?"
   - **Allowed Domains**: (empty for local dev)
3. Click **Save Configuration**
4. Click **Copy to Clipboard** to get the embed snippet:
   ```html
   <script src="http://127.0.0.1:8000/api/v1/widget/embed.js" async></script>
   ```

### Phase 2: Agent Availability (3)

**Step 3: Verify Agent Availability**
1. Open new browser tab → http://localhost:3000/login
2. Login with `agent@demo.com` / `demo1234`
3. Redirected to `/agent` (Inbox)
4. Verify agent shows as "Available" in top-right (green indicator)
5. Keep this tab open - agent will receive conversations here

### Phase 3: Customer Widget Session (4-5)

**Step 4: Open Widget on External Page**
1. Create a simple HTML file (e.g., `demo-widget.html`) with the embed script:
   ```html
   <!DOCTYPE html>
   <html>
   <head>
     <title>Demo Website</title>
   </head>
   <body>
     <h1>Our Demo Website</h1>
     <p>Click the chat button in the bottom-right corner</p>
     <script src="http://127.0.0.1:8000/api/v1/widget/embed.js" async></script>
   </body>
   </html>
   ```
2. Open this file in a browser (or serve via `npx serve .`)
3. Widget launcher appears in bottom-right
4. Click launcher → Widget panel opens

**Step 5: Start Conversation & Get AI Response**
1. In widget: Click **"Start new conversation"**
2. Type: "Hello, I need help with my order"
3. Press Enter/Send
4. Observe:
   - Customer message appears (blue bubble, right-aligned)
   - **AI Assistant responds** (purple bubble, left-aligned) with demo response
   - Conversation status: "AI Handling"

### Phase 4: Human Handoff (6)

**Step 6: Request Human Agent**
1. In widget: Click **"Request human"** button
2. Observe:
   - System message: "Customer requested human assistance"
   - Status changes to "Assigned" or "Pending"
   - Message: "Connecting you with a human agent now."

### Phase 5: Agent Reply (7-8)

**Step 7: Agent Takes Conversation**
1. Switch to Agent tab (`/agent`)
2. Conversation appears in **Inbox** or **Assigned** queue
3. Click the conversation to open it
4. If status is "Pending", click **"Take"** button
5. Status changes to "Assigned" with your name

**Step 8: Agent Replies**
1. In agent conversation view, type: "Hello! I can help you with that order."
2. Ensure "Private Note" is **unchecked** (public reply)
3. Press Enter/Send
4. Observe message appears in conversation (indigo bubble, left-aligned)

### Phase 6: Customer Sees Reply (9)

**Step 9: Verify Widget Shows Agent Reply**
1. Switch back to widget tab
2. Agent's reply appears automatically (via 3-second polling)
3. Customer sees: "Hello! I can help you with that order."
4. Status shows: "A human agent is assisting you."

### Phase 7: Resolution (10)

**Step 10: Agent Resolves Conversation**
1. In agent view: Click **"Resolve"** button
2. Add resolution details: "Order issue resolved, refund processed"
3. Click **Resolve**
4. Conversation status changes to "Resolved"
5. Removed from agent's active queue

### Phase 8: Admin Oversight (11-12)

**Step 11: Admin Views All Conversations**
1. Switch to Admin tab (`/admin`)
2. Click **"All Conversations"** in sidebar (`/admin/conversations`)
3. Use filters: Status, Agent ID, Customer ID, Search
4. Find the demo conversation - shows full history

**Step 12: Admin Dashboard Metrics**
1. Go to **Dashboard** (`/admin`)
2. View real-time stats:
   - Total Conversations
   - Pending / Assigned / Resolved counts
   - Agent availability (Available/Busy)
   - Average Resolution Time

## API Verification Commands

### Widget Flow (via curl)

```bash
# 1. Create guest session
curl -X POST http://127.0.0.1:8000/api/v1/widget/session \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"guest_name": "Demo User", "page_url": "http://localhost:3000"}'

# 2. Start conversation with initial message
TOKEN="<session_token_from_step_1>"
curl -X POST http://127.0.0.1:8000/api/v1/widget/conversations \
  -H "Origin: http://localhost:3000" \
  -H "X-Widget-Session: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Demo Help", "initial_message": "Hello, I need help", "client_message_id": "demo-1"}'

# 3. Request human handoff
CID=<conversation_id_from_step_2>
curl -X POST http://127.0.0.1:8000/api/v1/widget/conversations/$CID/request-human \
  -H "Origin: http://localhost:3000" \
  -H "X-Widget-Session: $TOKEN"

# 4. Get conversation (widget view)
curl -X GET http://127.0.0.1:8000/api/v1/widget/conversations/$CID \
  -H "Origin: http://localhost:3000" \
  -H "X-Widget-Session: $TOKEN"
```

### Agent Flow (via curl)

```bash
# Login as agent
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=agent@demo.com&password=demo1234"

# Get assigned conversations
curl -X GET http://127.0.0.1:8000/api/v1/agent/conversations \
  -H "Authorization: Bearer <agent_token>"

# Send public reply
curl -X POST http://127.0.0.1:8000/api/v1/agent/conversations/<cid>/messages \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello! I can help.", "is_internal": false}'

# Resolve conversation
curl -X POST http://127.0.0.1:8000/api/v1/agent/conversations/<cid>/resolve \
  -H "Authorization: Bearer <agent_token>" \
  -H "Content-Type: application/json" \
  -d '{"resolution_details": "Issue resolved"}'
```

### Admin Flow (via curl)

```bash
# Login as admin
curl -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@demo.com&password=demo1234"

# Get all conversations
curl -X GET http://127.0.0.1:8000/api/v1/admin/conversations \
  -H "Authorization: Bearer <admin_token>"

# Get stats
curl -X GET http://127.0.0.1:8000/api/v1/admin/stats \
  -H "Authorization: Bearer <admin_token>"
```

## Key Features Verified

✅ **Idempotency**: Duplicate `client_message_id` returns existing message  
✅ **AI Response**: Demo AI replies when conversation in `ai_handling` status  
✅ **Human Handoff**: `request-human` endpoint triggers assignment  
✅ **Agent Assignment**: Auto-assigns to available agent (agent@demo.com)  
✅ **Privacy**: Internal notes hidden from widget/customer view  
✅ **Real-time**: Widget polls every 3 seconds for new messages  
✅ **Session Persistence**: Guest sessions survive page reload (localStorage)  

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Widget shows "Widget unavailable" | Check widget config: `widget_visibility=true`, `widget_availability=true`, `allowed_domains=[]` |
| Agent gets 403 on conversation | Admin must assign conversation to agent@demo.com first |
| AI doesn't respond | Verify conversation status is `ai_handling` (not `assigned`/`pending`) |
| No conversations in agent inbox | Check agent is "Available" and has capacity (max_conversations > active) |
| CORS errors | Ensure `Origin` header matches allowed_domains (empty = dev mode) |

## Reset Demo Data

```bash
# Backend: Clean test conversations
cd backend
python -c "
from app.db.session import SessionLocal
from app.models.conversation import Conversation
from app.models.message import Message
from sqlalchemy import delete
db = SessionLocal()
db.execute(delete(Message))
db.execute(delete(Conversation))
db.commit()
print('Cleaned conversations and messages')
"
```

## Development Commands

```bash
# Start all services
cd OpenChat
docker compose up -d  # PostgreSQL + Redis

# Backend (terminal 1)
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (terminal 2)
cd frontend
npm run dev

# Run tests
cd backend
python -m pytest tests/ -v
```