import sys
import time
import requests

API_URL = "http://127.0.0.1:8000/api/v1"
ADMIN_EMAIL = "admin@demo.com"
AGENT_EMAIL = "agent@demo.com"
PASSWORD = "demo1234"

def run_tests():
    print("==================================================")
    print("STARTING FULL END-TO-END VERIFICATION")
    print("==================================================")

    # 1. Login Admin
    print("\n[Step 1] Admin Authentication")
    res = requests.post(f"{API_URL}/auth/login", data={"username": ADMIN_EMAIL, "password": PASSWORD})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print(" -> Admin authenticated successfully")

    # 2. Login Agent
    print("\n[Step 2] Agent Authentication")
    res = requests.post(f"{API_URL}/auth/login", data={"username": AGENT_EMAIL, "password": PASSWORD})
    assert res.status_code == 200, f"Agent login failed: {res.text}"
    agent_token = res.json()["access_token"]
    agent_headers = {"Authorization": f"Bearer {agent_token}"}
    print(" -> Agent authenticated successfully")

    # 3. Create Customer and Conversation
    print("\n[Step 3] Customer Session & Conversation Creation")
    cust_res = requests.post(f"{API_URL}/auth/login", data={"username": "customer@demo.com", "password": PASSWORD})
    assert cust_res.status_code == 200, f"Customer auth failed: {cust_res.text}"
    customer_token = cust_res.json()["access_token"]
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    conv_res = requests.post(f"{API_URL}/conversations", headers=customer_headers, json={
        "subject": "E2E Requirement Testing",
        "channel": "website"
    })
    assert conv_res.status_code == 201, f"Conv create failed: {conv_res.text}"
    conv_id = conv_res.json()["id"]
    print(f" -> Created test conversation #{conv_id}")

    # 4. Test Dashboard Stats: On Hold present in stats
    print("\n[Step 4] Admin Dashboard Stats: On Hold count")
    stats_res = requests.get(f"{API_URL}/admin/stats", headers=admin_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "on_hold" in stats["conversations"], "on_hold missing from stats"
    initial_on_hold = stats["conversations"]["on_hold"]
    print(f" -> Current On Hold count in stats: {initial_on_hold}")

    # 5. Admin sets conversation to On Hold
    print("\n[Step 5] Transition to On Hold")
    hold_res = requests.post(
        f"{API_URL}/admin/conversations/{conv_id}/status",
        headers=admin_headers,
        json={"status": "on_hold"}
    )
    assert hold_res.status_code == 200, f"Hold failed: {hold_res.text}"
    conv_check = requests.get(f"{API_URL}/admin/conversations/{conv_id}", headers=admin_headers).json()
    assert conv_check["status"] == "on_hold"
    assert conv_check["assigned_agent_id"] is None, "On Hold conversation must be unassigned"
    print(" -> Conversation successfully placed On Hold and unassigned")

    # Verify Dashboard On Hold count incremented
    stats_after_hold = requests.get(f"{API_URL}/admin/stats", headers=admin_headers).json()
    assert stats_after_hold["conversations"]["on_hold"] == initial_on_hold + 1
    print(f" -> Dashboard On Hold count verified: {stats_after_hold['conversations']['on_hold']}")

    # 6. Verify On Hold conversation is excluded from Pending queue
    print("\n[Step 6] Verify Exclusion from Pending Queue")
    pending_list = requests.get(f"{API_URL}/admin/conversations?status=pending", headers=admin_headers).json()
    assert not any(c["id"] == conv_id for c in pending_list), "On Hold conversation must not be in pending list"
    print(" -> Verified: conversation is excluded from pending queue")

    # 7. Move back to Pending
    print("\n[Step 7] Move from On Hold back to Pending")
    pend_res = requests.post(
        f"{API_URL}/admin/conversations/{conv_id}/status",
        headers=admin_headers,
        json={"status": "pending"}
    )
    assert pend_res.status_code == 200, f"Pending transition failed: {pend_res.text}"
    conv_check = requests.get(f"{API_URL}/admin/conversations/{conv_id}", headers=admin_headers).json()
    assert conv_check["status"] == "pending"
    print(" -> Successfully moved back to Pending")

    # 8. Set status to Waiting on Customer
    print("\n[Step 8] Set Status to Waiting on Customer")
    wait_res = requests.post(
        f"{API_URL}/admin/conversations/{conv_id}/status",
        headers=admin_headers,
        json={"status": "waiting_on_customer"}
    )
    assert wait_res.status_code == 200
    conv_check = requests.get(f"{API_URL}/admin/conversations/{conv_id}", headers=admin_headers).json()
    assert conv_check["status"] == "waiting_on_customer"
    print(" -> Status is waiting_on_customer")

    # 9. Customer sends message -> automatically transitions to Open
    print("\n[Step 9] Customer replies -> Auto-transition from Waiting on Customer to Open")
    cust_msg = requests.post(
        f"{API_URL}/conversations/{conv_id}/messages",
        headers=customer_headers,
        json={"content": "Here is my response!"}
    )
    assert cust_msg.status_code in (200, 201), f"cust_msg failed: {cust_msg.status_code} {cust_msg.text}"
    conv_check = requests.get(f"{API_URL}/admin/conversations/{conv_id}", headers=admin_headers).json()
    assert conv_check["status"] in ("open", "pending"), f"Expected open or pending, got {conv_check['status']}"
    print(f" -> Auto-transitioned to {conv_check['status']} successfully upon customer reply (eligible for handling)")

    # 10. Global Note: One persistent note per conversation
    print("\n[Step 10] Global Note Update & Persistence")
    note_content = "Special SLA context. Escalated account. @Demo Agent please review priority."
    note_res = requests.patch(
        f"{API_URL}/admin/conversations/{conv_id}/global-note",
        headers=admin_headers,
        json={"content": note_content}
    )
    assert note_res.status_code == 200, f"Global note update failed: {note_res.text}"
    note_data = note_res.json()
    assert note_data["global_note"] == note_content
    assert "Demo Agent" in note_data["mentioned_agents"], "Demo Agent mention not detected"
    print(" -> Global Note saved with @Demo Agent mention")

    # Verify Agent sees the same Global Note
    agent_view = requests.get(f"{API_URL}/agent/conversations/{conv_id}", headers=agent_headers).json()
    assert agent_view["global_note"] == note_content
    assert agent_view["global_note_updated_by_name"] == "Demo Admin"
    print(" -> Agent verified identical persistent Global Note and author metadata")

    # 11. Security Check: Customer cannot view or edit Global Note
    print("\n[Step 11] Security Check: Customer strictly forbidden from Global Note")
    cust_view = requests.get(f"{API_URL}/conversations/{conv_id}", headers=customer_headers).json()
    assert "global_note" not in cust_view or cust_view.get("global_note") is None, "Customer received global note!"

    cust_tamper = requests.patch(
        f"{API_URL}/conversations/{conv_id}/global-note",
        headers=customer_headers,
        json={"content": "Hacked note"}
    )
    assert cust_tamper.status_code == 403, f"Customer was not forbidden (got {cust_tamper.status_code})"
    print(" -> Security verified: 403 Forbidden for customers, never leaked")

    # 12. Mention Notification Check
    print("\n[Step 12] Mention Notification to Mentioned Agent")
    notif_res = requests.get(f"{API_URL}/notifications", headers=agent_headers).json()
    notifications = notif_res.get("notifications", [])
    mention_notifs = [n for n in notifications if n.get("type") == "mention" and n.get("reference_id") == conv_id]
    assert len(mention_notifs) > 0, f"No mention notification found for agent in conv {conv_id}"
    print(f" -> Found mention notification: {mention_notifs[0]['title']}")

    # 13. AI Agent Flow & Rules endpoint
    print("\n[Step 13] AI Flow & Rules: 9 stages & persistence")
    flow_get = requests.get(f"{API_URL}/admin/ai/flow", headers=admin_headers)
    assert flow_get.status_code == 200
    flow_data = flow_get.json()
    assert len(flow_data["stages"]) == 9, f"Expected 9 stages, got {len(flow_data['stages'])}"
    print(f" -> Verified 9 flow stages: {[s['name'] for s in flow_data['stages']]}")

    # Update AI flow rules
    flow_update = requests.put(
        f"{API_URL}/admin/ai/flow",
        headers=admin_headers,
        json={
            "confidence_threshold": 0.85,
            "max_ai_turns": 7,
            "sensitive_topics": ["billing", "refund", "chargeback", "urgent escalation"],
            "fallback_response": "We have escalated this ticket to our senior tier."
        }
    )
    assert flow_update.status_code == 200
    updated_config = flow_update.json()["config"]
    assert updated_config["confidence_threshold"] == 0.85
    assert updated_config["max_ai_turns"] == 7
    assert "chargeback" in updated_config["sensitive_topics"]
    print(" -> AI Flow & Rules updated and persisted successfully")

    # 14. Resolve Conversation
    print("\n[Step 14] Resolve Conversation")
    res_res = requests.post(
        f"{API_URL}/admin/conversations/{conv_id}/status",
        headers=admin_headers,
        json={"status": "resolved", "resolution_details": "All test criteria verified"}
    )
    assert res_res.status_code == 200
    final_conv = requests.get(f"{API_URL}/admin/conversations/{conv_id}", headers=admin_headers).json()
    assert final_conv["status"] == "resolved"
    print(" -> Conversation successfully resolved")

    print("\n==================================================")
    print("ALL API AND BUSINESS LOGIC TESTS PASSED (14/14)!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
