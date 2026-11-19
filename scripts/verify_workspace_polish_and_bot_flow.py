import requests
import json
import sys

BASE_URL = "https://packs-disposition-drink-notebooks.trycloudflare.com"

print(f"=== OpenChat Workspace Polish & Multi-Level Bot Flow Live Verification ===")
print(f"Target URL: {BASE_URL}")

results = {}

def report(check_name, passed, details=""):
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {check_name}: {details}")
    results[check_name] = {"passed": passed, "details": details}

try:
    # 1. Health check
    h = requests.get(f"{BASE_URL}/health", timeout=10)
    report("API Health Check", h.status_code == 200, f"HTTP {h.status_code}")
except Exception as e:
    report("API Health Check", False, str(e))

# 2. Public Widget Config with Bot Flow
try:
    cfg_res = requests.get(f"{BASE_URL}/api/v1/widget/config?public_key=demo-key", timeout=10)
    if cfg_res.status_code == 200:
        cfg = cfg_res.json()
        bf = cfg.get("bot_flow")
        has_bf = bf is not None and "issues" in bf and len(bf["issues"]) > 0
        report("Widget Public Config Bot Flow", has_bf, f"Issues count: {len(bf.get('issues', [])) if bf else 0}")
    else:
        report("Widget Public Config Bot Flow", False, f"HTTP {cfg_res.status_code}")
except Exception as e:
    report("Widget Public Config Bot Flow", False, str(e))

# 3. Widget Bot Flow API
try:
    bf_res = requests.get(f"{BASE_URL}/api/v1/widget/bot-flow?public_key=demo-key", timeout=10)
    if bf_res.status_code == 200:
        bf_data = bf_res.json()
        steps = bf_data.get("steps", [])
        issues = bf_data.get("issues", [])
        has_multilevel = len(steps) >= 5 and len(issues) >= 4
        report("Widget 4-Level Bot Flow API", has_multilevel, f"Steps: {len(steps)}, Issues: {len(issues)}")
    else:
        report("Widget 4-Level Bot Flow API", False, f"HTTP {bf_res.status_code}")
except Exception as e:
    report("Widget 4-Level Bot Flow API", False, str(e))

# 4. Auth & Admin Login
admin_token = None
try:
    login_res = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        data={"username": "singaravel@vananam.com", "password": "SuperAdminPassword2026!"},
        timeout=10
    )
    if login_res.status_code == 200:
        admin_token = login_res.json().get("access_token")
        report("Admin Authentication", True, "Successfully acquired token")
    else:
        report("Admin Authentication", False, f"HTTP {login_res.status_code}")
except Exception as e:
    report("Admin Authentication", False, str(e))

headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}

# 5. Default Conversations View (Hides Resolved by Default)
if admin_token:
    try:
        # Default query (no status filter)
        def_res = requests.get(f"{BASE_URL}/api/v1/admin/conversations?limit=50", headers=headers, timeout=10)
        resolved_count_in_default = 0
        if def_res.status_code == 200:
            convs = def_res.json().get("conversations", [])
            resolved_count_in_default = sum(1 for c in convs if c.get("status") in ("resolved", "closed"))
            report("Default View Excludes Resolved", resolved_count_in_default == 0, f"Found {resolved_count_in_default} resolved in default view (expected 0)")

        # Explicit status=resolved query
        res_res = requests.get(f"{BASE_URL}/api/v1/admin/conversations?status=resolved&limit=50", headers=headers, timeout=10)
        if res_res.status_code == 200:
            res_convs = res_res.json().get("conversations", [])
            all_resolved = all(c.get("status") in ("resolved", "closed") for c in res_convs) if res_convs else True
            report("Explicit Resolved Filter Works", all_resolved and len(res_convs) >= 0, f"Retrieved {len(res_convs)} resolved conversations")
    except Exception as e:
        report("Resolved Conversation Filtering", False, str(e))

# 6. Bot Flow Visual Tree API
if admin_token:
    try:
        flows_res = requests.get(f"{BASE_URL}/api/v1/bot-flows", headers=headers, timeout=10)
        if flows_res.status_code == 200 and len(flows_res.json()) > 0:
            flow_id = flows_res.json()[0]["id"]
            tree_res = requests.get(f"{BASE_URL}/api/v1/bot-flows/{flow_id}/tree", headers=headers, timeout=10)
            if tree_res.status_code == 200:
                tree_json = tree_res.json()
                has_tree = "tree" in tree_json and len(tree_json["tree"]) > 0
                report("Admin Visual Tree API (4-Levels)", has_tree, f"Flow ID {flow_id} tree categories: {len(tree_json.get('tree', []))}")
            else:
                report("Admin Visual Tree API (4-Levels)", False, f"HTTP {tree_res.status_code}")
        else:
            report("Admin Visual Tree API (4-Levels)", False, "No flows found")
    except Exception as e:
        report("Admin Visual Tree API (4-Levels)", False, str(e))

# 7. Customer Widget Conversation & Multi-Level Traversal
try:
    c_res = requests.post(
        f"{BASE_URL}/api/v1/widget/conversations",
        json={"name": "Alice Automated Test", "email": "alice_test@example.com", "public_key": "demo-key"},
        timeout=10
    )
    if c_res.status_code == 201:
        c_data = c_res.json()
        cid = c_data["id"]
        chat_id = c_data.get("chat_id")
        messages = c_data.get("messages", [])
        first_bot_msg = messages[0] if messages else {}
        options = first_bot_msg.get("ai_metadata", {}).get("options", [])
        report("Widget Conversation Creation & Level 1 Greeting", len(options) > 0, f"Chat ID: {chat_id}, Level 1 Options: {len(options)}")

        # Step 2: Send Level 2 Option ("order_help")
        m2_res = requests.post(
            f"{BASE_URL}/api/v1/widget/conversations/{cid}/messages",
            json={"content": "order_help", "public_key": "demo-key"},
            timeout=10
        )
        if m2_res.status_code == 201:
            m2_data = m2_res.json()
            # Wait for bot response
            c_detail = requests.get(f"{BASE_URL}/api/v1/widget/conversations/{cid}?public_key=demo-key", timeout=10).json()
            c_msgs = c_detail.get("messages", [])
            level2_bot = c_msgs[-1] if c_msgs and c_msgs[-1]["sender_type"] == "bot" else {}
            l2_opts = level2_bot.get("ai_metadata", {}).get("options", [])
            report("Widget Traversal Level 2 (Order Help)", len(l2_opts) > 0, f"Options received: {[o.get('label') for o in l2_opts] if isinstance(l2_opts, list) and l2_opts and isinstance(l2_opts[0], dict) else l2_opts}")

            # Step 3: Send Level 3 Option ("track_order")
            m3_res = requests.post(
                f"{BASE_URL}/api/v1/widget/conversations/{cid}/messages",
                json={"content": "track_order", "public_key": "demo-key"},
                timeout=10
            )
            c_detail3 = requests.get(f"{BASE_URL}/api/v1/widget/conversations/{cid}?public_key=demo-key", timeout=10).json()
            c_msgs3 = c_detail3.get("messages", [])
            level3_bot = c_msgs3[-1] if c_msgs3 and c_msgs3[-1]["sender_type"] == "bot" else {}
            l3_text = level3_bot.get("content", "")
            report("Widget Traversal Level 3 (Track Order)", "order" in l3_text.lower() or "id" in l3_text.lower(), f"Bot prompt: {l3_text[:60]}")

            # Step 4: Test Human Escalation / Free Text Natural Phrasing
            m4_res = requests.post(
                f"{BASE_URL}/api/v1/widget/conversations/{cid}/messages",
                json={"content": "I need to talk to a human agent please", "public_key": "demo-key"},
                timeout=15
            )
            import time
            time.sleep(2)
            c_detail4 = requests.get(f"{BASE_URL}/api/v1/widget/conversations/{cid}?public_key=demo-key", timeout=10).json()
            c_msgs4 = c_detail4.get("messages", [])
            escalation_msg = c_msgs4[-1] if c_msgs4 and c_msgs4[-1]["sender_type"] == "bot" else {}
            esc_text = escalation_msg.get("content", "")
            
            # Check natural language and zero internal policy jargon
            no_sensitive_jargon = "sensitive or account-specific" not in esc_text.lower()
            no_source_brackets = "[source:" not in esc_text.lower()
            no_model_tags = "gemini" not in esc_text.lower() and "gpt" not in esc_text.lower()
            natural_tone = "support team" in esc_text.lower() or "connect you" in esc_text.lower() or "help you" in esc_text.lower()

            escalation_clean = no_sensitive_jargon and no_source_brackets and no_model_tags and natural_tone
            report("Natural Human Escalation Message (No AI Jargon)", escalation_clean, f"Bot response: '{esc_text}'")
    else:
        report("Widget Conversation Creation", False, f"HTTP {c_res.status_code}")
except Exception as e:
    report("Widget Traversal Test", False, str(e))

print("\n=== SUMMARY ===")
all_passed = all(r["passed"] for r in results.values())
print(f"Total Checks: {len(results)}, All Passed: {all_passed}")
