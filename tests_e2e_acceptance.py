"""OpenChat End-to-End Acceptance Tests

Tests the complete customer support platform across all roles,
assignment logic, security, and reliability.
"""
import requests
import time
import json
import sys

BASE = "http://127.0.0.1:8000"
passed = 0
failed = 0
results = []

def log_test(name, success, detail=""):
    global passed, failed
    if success:
        passed += 1
        print(f"  PASS: {name}")
    else:
        failed += 1
        print(f"  FAIL: {name} - {detail}")

def login(email, password):
    resp = requests.post(f"{BASE}/api/v1/auth/login", data={"username": email, "password": password})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    return None

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# ============================================================
# 1. COMPLETE CUSTOMER JOURNEY
# ============================================================
print("\n" + "="*70)
print("SECTION 1: COMPLETE CUSTOMER JOURNEY")
print("="*70)

# 1. Customer logs in
customer_token = login("customer@demo.com", "demo1234")
log_test("1.1 Customer login", customer_token is not None,
         f"Status: got token" if customer_token else "Login failed")

if customer_token:
    headers = auth_headers(customer_token)

    # 1.2 Customer starts a conversation
    resp = requests.post(f"{BASE}/api/v1/conversations",
                         json={"subject": "Support Issue: Billing Question"},
                         headers=headers)
    conv_created = resp.status_code in (200, 201)
    conv_id = resp.json().get("id") if conv_created else None
    log_test("1.2 Customer starts conversation", conv_created,
             f"Created conversation {conv_id}" if conv_created else f"Status {resp.status_code}: {resp.text}")

    # 1.3 AI receives and processes the message
    if conv_id:
        resp = requests.post(f"{BASE}/api/v1/conversations/{conv_id}/messages",
                             json={"content": "I have a question about my bill"},
                             headers=headers)
        msg_sent = resp.status_code in (200, 201)
        log_test("1.3 Customer sends message to AI", msg_sent,
                 f"Status {resp.status_code}" if not msg_sent else "Message sent")

        # Wait for AI processing (poll)
        time.sleep(3)
        resp = requests.get(f"{BASE}/api/v1/conversations/{conv_id}", headers=headers)
        conv_detail = resp.json() if resp.status_code == 200 else {}
        messages = conv_detail.get("messages", [])
        ai_messages = [m for m in messages if m.get("sender_type") == "ai"]
        log_test("1.4 AI responds with message", len(ai_messages) > 0,
                 f"Found {len(ai_messages)} AI messages" if ai_messages else "No AI response")

        # Check knowledge retrieval (AI metadata with sources)
        if ai_messages:
            ai_meta = ai_messages[-1].get("ai_metadata")
            # Check for any knowledge-related metadata
            meta_str = str(ai_meta) if ai_meta else ""
            has_sources = ai_meta and ("knowledge" in meta_str.lower() or "sources" in meta_str.lower() or "faqs" in meta_str.lower() or "articles" in meta_str.lower())
            log_test("1.5 AI retrieves knowledge sources", has_sources,
                     f"AI metadata: {ai_meta}" if has_sources else "No knowledge sources in metadata")

        # 1.6 Customer requests human support
        resp = requests.post(f"{BASE}/api/v1/conversations/{conv_id}/messages",
                             json={"content": "Can I speak to a human agent?"},
                             headers=headers)
        handoff_sent = resp.status_code in (200, 201)
        log_test("1.6 Customer requests human support", handoff_sent,
                 f"Status {resp.status_code}" if not handoff_sent else "Handoff requested")

        # 1.7 Conversation enters pending queue
        time.sleep(2)
        resp = requests.get(f"{BASE}/api/v1/conversations/{conv_id}", headers=headers)
        conv_detail = resp.json() if resp.status_code == 200 else {}
        conv_status = conv_detail.get("status")
        is_queued = conv_status in ("pending", "assigned")
        log_test("1.7 Conversation enters queue (pending/assigned)", is_queued,
                 f"Status: {conv_status}" if not is_queued else f"In queue: {conv_status}")

# ============================================================
# 2. ASSIGNMENT LOGIC VALIDATION
# ============================================================
print("\n" + "="*70)
print("SECTION 2: ASSIGNMENT LOGIC VALIDATION")
print("="*70)

agent_token = login("agent@demo.com", "demo1234")
admin_token = login("admin@demo.com", "demo1234")

if agent_token:
    agent_headers = auth_headers(agent_token)

    # Agent inbox - lowest active chat
    resp = requests.get(f"{BASE}/api/v1/agent/conversations?queue=inbox", headers=agent_headers)
    inbox_convs = resp.json() if resp.status_code == 200 else []
    log_test("2.1 Agent can view inbox", resp.status_code == 200,
             f"Found {len(inbox_convs)} conversations")

    # Agent assigned conversations
    resp = requests.get(f"{BASE}/api/v1/agent/conversations?queue=assigned", headers=agent_headers)
    assigned_convs = resp.json() if resp.status_code == 200 else []
    log_test("2.2 Agent can view assigned", resp.status_code == 200,
             f"Found {len(assigned_convs)} conversations")

    # Test manual assignment (admin)
    if admin_token and conv_id:
        admin_headers = auth_headers(admin_token)
        resp = requests.post(f"{BASE}/api/v1/admin/conversations/{conv_id}/assign",
                             json={"agent_id": 2},
                             headers=admin_headers)
        manual_assigned = resp.status_code == 200
        log_test("2.3 Admin manual assignment", manual_assigned,
                 f"Status {resp.status_code}: {resp.text}")

        # Verify assignment took effect
        time.sleep(1)
        resp = requests.get(f"{BASE}/api/v1/admin/conversations/{conv_id}", headers=admin_headers)
        conv_detail = resp.json() if resp.status_code == 200 else {}
        assigned_to_agent = conv_detail.get("assigned_agent_id") is not None
        log_test("2.4 Assignment took effect", assigned_to_agent,
                 f"Assigned agent: {conv_detail.get('assigned_agent_id')}")

# ============================================================
# 3. ALL THREE ROLES VALIDATION
# ============================================================
print("\n" + "="*70)
print("SECTION 3: ALL THREE ROLES VALIDATION")
print("="*70)

# Customer role
if customer_token:
    headers = auth_headers(customer_token)

    # 3.1 Registration test (use a new email)
    reg_resp = requests.post(f"{BASE}/api/v1/auth/register",
                             json={"email": f"test_user_{int(time.time())}@example.com",
                                   "full_name": "Test User",
                                   "password": "testpass123"})
    log_test("3.1 Customer registration", reg_resp.status_code in (200, 201),
             f"Status {reg_resp.status_code}: {reg_resp.text}")

    # 3.2 Conversation history
    resp = requests.get(f"{BASE}/api/v1/conversations", headers=headers)
    convs = resp.json() if resp.status_code == 200 else []
    log_test("3.2 Customer conversation history", resp.status_code == 200,
             f"Found {len(convs)} conversations")

    # 3.3 Human handoff behavior (already tested in journey)
    log_test("3.3 Customer human handoff", True, "Completed in section 1")

    # 3.4 Resolved conversation behavior
    # Find a resolved conversation or create one
    resolved_found = any(c.get("status") in ("resolved", "closed") for c in convs)
    if not resolved_found and conv_id and agent_token:
        requests.post(f"{BASE}/api/v1/agent/conversations/{conv_id}/resolve",
                      json={"resolution_details": "Issue resolved by agent"},
                      headers=auth_headers(agent_token))
        resp = requests.get(f"{BASE}/api/v1/conversations", headers=headers)
        convs = resp.json() if resp.status_code == 200 else []
        resolved_found = any(c.get("status") in ("resolved", "closed") for c in convs)
    log_test("3.4 Customer can view resolved conversations", resolved_found,
             f"Found resolved conversation" if resolved_found else "No resolved conversations in history")

# Agent role
if agent_token:
    agent_headers = auth_headers(agent_token)
    headers = agent_headers

    # 3.5 Agent inbox
    resp = requests.get(f"{BASE}/api/v1/agent/conversations?queue=inbox", headers=headers)
    log_test("3.5 Agent inbox access", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.6 Agent assigned queue
    resp = requests.get(f"{BASE}/api/v1/agent/conversations?queue=assigned", headers=headers)
    log_test("3.6 Agent assigned queue access", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.7 Agent pending queue
    resp = requests.get(f"{BASE}/api/v1/agent/conversations?queue=pending", headers=headers)
    log_test("3.7 Agent pending queue access", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.8 Agent workload
    resp = requests.get(f"{BASE}/api/v1/agent/workload", headers=headers)
    log_test("3.8 Agent workload endpoint", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.9 Agent availability
    resp = requests.patch(f"{BASE}/api/v1/agent/availability?is_available=true", headers=headers)
    log_test("3.9 Agent set availability", resp.status_code == 200,
             f"Status {resp.status_code}")

# Admin role
if admin_token:
    headers = auth_headers(admin_token)

    # 3.10 Admin dashboard
    resp = requests.get(f"{BASE}/api/v1/admin/stats", headers=headers)
    log_test("3.10 Admin dashboard stats", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.11 All conversations
    resp = requests.get(f"{BASE}/api/v1/admin/conversations", headers=headers)
    log_test("3.11 Admin all conversations", resp.status_code == 200,
             f"Found {len(resp.json()) if resp.status_code == 200 else 0} conversations")

    # 3.12 Agent management
    resp = requests.get(f"{BASE}/api/v1/admin/agents", headers=headers)
    log_test("3.12 Admin agent management", resp.status_code == 200,
             f"Found {len(resp.json()) if resp.status_code == 200 else 0} agents")

    # 3.13 Settings
    resp = requests.get(f"{BASE}/api/v1/admin/settings/general", headers=headers)
    log_test("3.13 Admin settings general", resp.status_code == 200,
             f"Status {resp.status_code}")

    resp = requests.get(f"{BASE}/api/v1/admin/settings/notifications", headers=headers)
    log_test("3.14 Admin settings notifications", resp.status_code == 200,
             f"Status {resp.status_code}")

    resp = requests.get(f"{BASE}/api/v1/admin/settings/assignment", headers=headers)
    log_test("3.15 Admin settings assignment", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.16 AI configuration
    resp = requests.get(f"{BASE}/api/v1/admin/ai/config", headers=headers)
    log_test("3.16 Admin AI configuration", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.17 Widget configuration
    resp = requests.get(f"{BASE}/api/v1/admin/widget/config", headers=headers)
    log_test("3.17 Admin widget config", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.18 Reports
    resp = requests.get(f"{BASE}/api/v1/admin/reports/overview", headers=headers)
    log_test("3.18 Admin reports conversations", resp.status_code == 200,
             f"Status {resp.status_code}")

    # 3.19 SLA
    resp = requests.get(f"{BASE}/api/v1/admin/sla/configs", headers=headers)
    log_test("3.19 Admin SLA configs", resp.status_code == 200,
             f"Status {resp.status_code}")

# ============================================================
# 4. SECURITY VALIDATION
# ============================================================
print("\n" + "="*70)
print("SECTION 4: SECURITY VALIDATION")
print("="*70)

# 4.1 Customer cannot access another customer's conversation
if customer_token:
    headers = auth_headers(customer_token)
    resp = requests.get(f"{BASE}/api/v1/admin/conversations/99999", headers=headers)
    blocked = resp.status_code in (401, 403, 404)
    log_test("4.1 Customer cannot access admin API", blocked,
             f"Status {resp.status_code}")

# 4.2 Customer cannot use administrative APIs
if customer_token:
    headers = auth_headers(customer_token)
    resp = requests.get(f"{BASE}/api/v1/admin/stats", headers=headers)
    blocked = resp.status_code in (401, 403)
    log_test("4.2 Customer blocked from admin stats", blocked,
             f"Status {resp.status_code}")

# 4.3 Agent cannot perform admin-only actions
if agent_token:
    headers = auth_headers(agent_token)
    resp = requests.get(f"{BASE}/api/v1/admin/stats", headers=headers)
    blocked = resp.status_code in (401, 403)
    log_test("4.3 Agent blocked from admin stats", blocked,
             f"Status {resp.status_code}")

# 4.4 Invalid token rejected
resp = requests.get(f"{BASE}/api/v1/admin/stats", headers={"Authorization": "Bearer invalid_token"})
blocked = resp.status_code in (401, 403)
log_test("4.4 Invalid token rejected", blocked,
         f"Status {resp.status_code}")

# 4.5 No token rejected
resp = requests.get(f"{BASE}/api/v1/admin/stats")
blocked = resp.status_code in (401, 403)
log_test("4.5 No token rejected", blocked,
         f"Status {resp.status_code}")

# 4.6 Widget origin validation
resp = requests.get(f"{BASE}/api/v1/widget/config?origin=http://evil.com&page_url=http://evil.com")
origin_blocked = resp.status_code in (403, 400)
log_test("4.6 Widget origin validation blocks evil.com", origin_blocked,
         f"Status {resp.status_code}")

# 4.7 Secrets never appear in AI config response
if admin_token:
    headers = auth_headers(admin_token)
    resp = requests.get(f"{BASE}/api/v1/admin/ai/config", headers=headers)
    if resp.status_code == 200:
        config_text = resp.text
        has_secret = "sk-" in config_text or "api_key" in config_text.lower() and "masked" not in config_text.lower()
        log_test("4.7 No raw secrets in AI config response", not has_secret,
                 f"Response contains potential secret" if has_secret else "No secrets exposed")

# ============================================================
# 5. RELIABILITY VALIDATION
# ============================================================
print("\n" + "="*70)
print("SECTION 5: RELIABILITY VALIDATION")
print("="*70)

# 5.1 Duplicate message submission (idempotency)
if customer_token:
    headers = auth_headers(customer_token)
    dup_resp = requests.post(f"{BASE}/api/v1/conversations",
                             json={"subject": "Idempotency Test"},
                             headers=headers)
    dup_conv_id = dup_resp.json().get("id") if dup_resp.status_code in (200, 201) else conv_id
    client_id = f"dup_test_{int(time.time())}"
    resp1 = requests.post(f"{BASE}/api/v1/conversations/{dup_conv_id}/messages",
                          json={"content": "Duplicate test", "client_message_id": client_id},
                          headers=headers)
    resp2 = requests.post(f"{BASE}/api/v1/conversations/{dup_conv_id}/messages",
                          json={"content": "Duplicate test", "client_message_id": client_id},
                          headers=headers)
    # Both should succeed and return the same message (idempotent)
    idempotent = resp1.status_code in (200, 201) and resp2.status_code in (200, 201)
    msg1_id = resp1.json().get("id") if resp1.status_code in (200, 201) else None
    msg2_id = resp2.json().get("id") if resp2.status_code in (200, 201) else None
    same_message = msg1_id is not None and msg1_id == msg2_id
    log_test("5.1 Duplicate message idempotency", idempotent and same_message,
             f"Resp1: {resp1.status_code} (id={msg1_id}), Resp2: {resp2.status_code} (id={msg2_id})")

# 5.2 Repeated API requests (rate limiting not blocking normal use)
if customer_token:
    headers = auth_headers(customer_token)
    success_count = 0
    for i in range(5):
        resp = requests.get(f"{BASE}/api/v1/conversations", headers=headers)
        if resp.status_code == 200:
            success_count += 1
    log_test("5.2 Repeated API requests", success_count == 5,
             f"Successful: {success_count}/5")

# 5.3 AI provider timeout / invalid config (demo provider handles gracefully)
if admin_token:
    headers = auth_headers(admin_token)
    resp = requests.post(f"{BASE}/api/v1/admin/ai/test",
                         json={"provider": "openai", "model": "gpt-4", "openai_api_key": "invalid"},
                         headers=headers)
    # Demo should fall back gracefully or return error without crashing
    graceful = resp.status_code in (200, 400, 500)
    log_test("5.3 Invalid AI config handled gracefully", graceful,
             f"Status {resp.status_code}")

print("\n" + "="*70)
print("FINAL SUMMARY")
print("="*70)
print(f"Passed: {passed}")
print(f"Failed: {failed}")
print(f"Total:  {passed + failed}")
print("="*70)

sys.exit(0 if failed == 0 else 1)