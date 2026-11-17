import urllib.request
import urllib.parse
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def login(user, pwd):
    data = urllib.parse.urlencode({"username": user, "password": pwd}).encode()
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=data)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())["access_token"]

def api_call(path, method="GET", body=None, token=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req)
        status = resp.status
        res_data = resp.read().decode()
        return status, json.loads(res_data) if res_data else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

def main():
    admin_token = login("admin@demo.com", "demo1234")
    agent_token = login("agent@demo.com", "demo1234")
    customer_token = login("customer@demo.com", "demo1234")

    print("Logged in as Admin, Agent, and Customer.\n")

    # 1. Create a fresh conversation as customer
    status, conv = api_call("/conversations", "POST", {
        "subject": "Testing Additional Requirements",
        "channel": "website"
    }, token=customer_token)
    assert status == 201, f"Failed to create conversation: {status} {conv}"
    conv_id = conv["id"]
    print(f"Created Conversation #{conv_id} (status: {conv['status']})")

    # 2. Transition to on_hold as Admin
    status, res = api_call(f"/admin/conversations/{conv_id}/status", "POST", {
        "status": "on_hold"
    }, token=admin_token)
    assert status == 200, f"Failed to set status to on_hold: {status} {res}"
    print(f"Admin placed Conversation #{conv_id} On Hold.")

    # 3. Check stats has on_hold >= 1
    status, stats = api_call("/admin/stats", "GET", token=admin_token)
    on_hold_count = stats["conversations"].get("on_hold", 0)
    print(f"Stats On Hold count: {on_hold_count}")
    assert on_hold_count >= 1, "On Hold count should be at least 1!"

    # 4. Verify on_hold conversation is NOT auto-assigned by pending queue
    import sys
    sys.path.insert(0, 'backend')
    from app.db.session import SessionLocal
    from app.services.assignment_service import process_pending_queue
    from app.models.conversation import Conversation
    db = SessionLocal()
    try:
        c = db.query(Conversation).filter(Conversation.id == conv_id).first()
        assert c.status == "on_hold", f"DB status is {c.status}, expected on_hold"
        assert c.assigned_agent_id is None, "On Hold conversation must be unassigned"
        
        # Run pending queue
        process_pending_queue(db)
        db.refresh(c)
        assert c.status == "on_hold", "On Hold conversation must remain on_hold after queue processing"
        assert c.assigned_agent_id is None, "On Hold conversation must NOT be assigned"
        print("Verified: On Hold conversation is strictly excluded from auto-assignment.")
    finally:
        db.close()

    # 5. Move from on_hold back to pending
    status, res = api_call(f"/admin/conversations/{conv_id}/status", "POST", {
        "status": "pending"
    }, token=admin_token)
    assert status == 200, f"Failed to move to pending: {status} {res}"
    print(f"Admin moved Conversation #{conv_id} from On Hold to Pending.")

    # 6. Global Note Test: Admin writes note with @mention
    note_content = "Internal priority note: please follow up @Demo Agent on account status."
    status, note_res = api_call(f"/admin/conversations/{conv_id}/global-note", "PATCH", {
        "note": note_content
    }, token=admin_token)
    assert status == 200, f"Failed to update global note: {status} {note_res}"
    print(f"Admin updated Global Note: '{note_res.get('global_note')}'")
    print(f"Mentioned agents: {note_res.get('mentioned_agents')}")
    assert "Demo Agent" in note_res.get("mentioned_agents", []), "Demo Agent should be detected in mention!"

    # 7. Check Agent received mention notification
    status, notifs = api_call("/notifications", "GET", token=agent_token)
    items = notifs.get("notifications", []) if isinstance(notifs, dict) else []
    mention_notif = next((n for n in items if n.get("type") == "mention" and n.get("reference_id") == conv_id), None)
    assert mention_notif is not None, f"Agent should have received mention notification! Got: {items}"
    print(f"Verified mention notification for agent: '{mention_notif.get('title')}' - '{mention_notif.get('message')}'")

    # 8. Check Agent reads the Global Note
    status, agent_conv = api_call(f"/agent/conversations/{conv_id}", "GET", token=agent_token)
    assert status == 200, f"Agent failed to get conversation: {status}"
    assert agent_conv.get("global_note") == note_content, "Agent should see the persistent Global Note"
    print(f"Agent read persistent Global Note (updated by: {agent_conv.get('global_note_updated_by_name')})")

    # 9. Customer MUST NOT see the Global Note
    status, cust_conv = api_call(f"/conversations/{conv_id}", "GET", token=customer_token)
    assert status == 200, f"Customer failed to get conversation: {status}"
    assert cust_conv.get("global_note") is None, "Customer MUST NOT see global_note!"
    print("Security Verified: Customer response has global_note = None.")

    # Customer trying to update global note MUST get 403 Forbidden
    status, cust_hack = api_call(f"/conversations/{conv_id}/global-note", "PATCH", {
        "note": "Malicious customer attempt"
    }, token=customer_token)
    assert status == 403, f"Customer should be 403 Forbidden on global-note! Got {status}"
    print("Security Verified: Customer cannot update global note (403 Forbidden).")

    # 10. Agent changes status to waiting_on_customer
    # First assign agent to conversation
    api_call(f"/admin/conversations/{conv_id}/assign", "POST", {"agent_id": 2}, token=admin_token)
    status, res = api_call(f"/agent/conversations/{conv_id}/status", "POST", {
        "status": "waiting_on_customer"
    }, token=agent_token)
    assert status == 200, f"Failed to set waiting_on_customer: {status} {res}"
    print("Agent set status to 'waiting_on_customer'.")

    # 11. Customer sends a new message -> should automatically transition to 'open'
    status, msg = api_call(f"/conversations/{conv_id}/messages", "POST", {
        "content": "Hello agent, here is my reply!"
    }, token=customer_token)
    assert status == 201, f"Failed to send customer message: {status} {msg}"
    print("Customer sent a message.")

    # Check conversation status now: should be 'open' (or 'assigned')
    status, check_conv = api_call(f"/agent/conversations/{conv_id}", "GET", token=agent_token)
    print(f"Conversation status after customer reply: '{check_conv.get('status')}'")
    assert check_conv.get("status") in ("open", "assigned"), f"Status should be open or assigned, got {check_conv.get('status')}"
    print("Verified: Customer reply automatically transitioned conversation from waiting_on_customer back to open/assigned.")

    # 12. Test AI Flow endpoint
    status, flow = api_call("/admin/ai/flow", "GET", token=admin_token)
    assert status == 200, f"Failed to get AI flow: {status}"
    assert len(flow["stages"]) == 9, "Should have 9 flow stages"
    print(f"Verified AI Flow: {len(flow['stages'])} stages loaded.")

    # Test update AI Flow rules
    status, updated_flow = api_call("/admin/ai/flow", "PUT", {
        "flow_enabled": True,
        "config": {
            "max_ai_turns": 4,
            "fallback_response": "Custom fallback response from test."
        }
    }, token=admin_token)
    assert status == 200, f"Failed to update AI flow: {status}"
    assert updated_flow["config"]["max_ai_turns"] == 4, "Updated max_ai_turns should be 4"
    assert updated_flow["config"]["fallback_response"] == "Custom fallback response from test."
    print("Verified: AI Flow configuration updated and persisted.")

    print("\n=======================================================")
    print("ALL 12 BACKEND FUNCTIONAL REQUIREMENTS TESTS PASSED!")
    print("=======================================================")

if __name__ == "__main__":
    main()
