import urllib.request
import urllib.parse
import json

BASE_URL = "http://127.0.0.1:8000/api/v1"

def get_token():
    data = urllib.parse.urlencode({"username": "admin@demo.com", "password": "demo1234"}).encode()
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
        return e.code, err_body

def main():
    token = get_token()
    print("Obtained Admin Token.\n")

    tests = [
        # 1. Dashboard / Stats
        ("GET", "/admin/stats", None, "Dashboard Stats"),
        
        # 2. Conversations
        ("GET", "/admin/conversations", None, "List Admin Conversations"),
        
        # 3. Agents
        ("GET", "/admin/agents", None, "List Agents"),
        ("POST", "/admin/agents", {
            "email": "testagent_audit_final@example.com",
            "password": "Password123!",
            "full_name": "Test Audit Agent Final",
            "max_conversations": 5,
            "is_available": True
        }, "Create Agent"),
        
        # 4. Teams
        ("GET", "/teams", None, "List Teams"),
        ("POST", "/teams", {
            "name": "Audit Test Team Final",
            "slug": "audit-test-team-final",
            "description": "Team created by audit"
        }, "Create Team"),
        
        # 5. Categories
        ("GET", "/admin/knowledge/categories", None, "List KB Categories"),
        ("POST", "/admin/knowledge/categories", {
            "name": "Audit Test Category Final",
            "slug": "audit-test-category-final",
            "description": "Category created by audit"
        }, "Create KB Category"),
        
        # 6. Articles
        ("GET", "/admin/knowledge/articles", None, "List KB Articles"),
        ("POST", "/admin/knowledge/articles", {
            "title": "Audit Test Article Final",
            "slug": "audit-test-article-final",
            "content": "Test content for article audit",
            "status": "published"
        }, "Create KB Article"),
        
        # 7. FAQs
        ("GET", "/admin/knowledge/faqs", None, "List KB FAQs"),
        ("POST", "/admin/knowledge/faqs", {
            "question": "What is OpenChat Audit Final?",
            "answer": "OpenChat audit validates admin features.",
            "is_published": True
        }, "Create KB FAQ"),
        
        # 8. Reports
        ("GET", "/admin/reports/overview", None, "Reports Overview"),
        ("GET", "/admin/reports/agents", None, "Reports Agents"),
        ("GET", "/admin/reports/time-series?metric=conversations_created", None, "Reports Time-Series"),
        ("GET", "/admin/reports/knowledge", None, "Reports Knowledge"),
        
        # 9. SLA
        ("GET", "/admin/sla/configs", None, "List SLA Configs"),
        ("POST", "/admin/sla/configs", {
            "name": "Audit High Priority SLA",
            "priority": "high",
            "response_time_minutes": 15,
            "resolution_time_minutes": 120,
            "is_active": True
        }, "Create SLA Config"),
        
        # 10. Settings General & Audit Logs
        ("GET", "/admin/settings/general", None, "List General Settings"),
        ("GET", "/admin/audit-logs?limit=10", None, "List Audit Logs"),
        
        # 11. AI Settings
        ("GET", "/admin/ai/config", None, "Get AI Config"),
        ("PUT", "/admin/ai/config", {
            "provider": "demo",
            "model_name": "demo-ai",
            "confidence_threshold": 0.75,
            "max_tokens": 1000,
            "temperature": 0.3,
            "auto_reply_enabled": True
        }, "Update AI Config"),
        
        # 12. Widget Settings
        ("GET", "/admin/widget/config", None, "Get Widget Config"),
        ("PUT", "/admin/widget/config", {
            "business_name": "OpenChat Support Verified",
            "color_hex": "#2563EB",
            "welcome_message": "Hello! How can we help?",
            "position": "bottom-right",
            "is_active": True
        }, "Update Widget Config"),
        
        # 13. Assignment Rules
        ("GET", "/admin/settings/assignment", None, "Get Assignment Rules"),
        
        # 14. Notifications
        ("GET", "/notifications", None, "List Notifications"),
        
        # 15. Canned Responses
        ("GET", "/canned-responses", None, "List Canned Responses"),
        ("POST", "/canned-responses", {
            "title": "Audit Greeting Final",
            "shortcut": "auditfinal",
            "content": "Hello from audit test final!"
        }, "Create Canned Response"),
        
        # 16. Custom Fields
        ("GET", "/custom-fields", None, "List Custom Fields"),
        ("POST", "/custom-fields", {
            "name": "Audit Field Final",
            "field_key": "audit_field_final",
            "field_type": "text"
        }, "Create Custom Field"),
        
        # 17. Business Hours & Holidays
        ("GET", "/business-hours", None, "List Business Hours"),
        ("GET", "/business-hours/holidays", None, "List Holidays"),
        ("GET", "/business-hours/is-open", None, "Check Business Open"),
        
        # 18. Webhooks
        ("GET", "/webhooks", None, "List Webhooks"),
        ("POST", "/webhooks", {
            "name": "Audit Webhook Final",
            "url": "https://example.com/webhook-final",
            "events": ["conversation.created"],
            "is_active": True
        }, "Create Webhook"),
        
        # 19. Automation Rules
        ("GET", "/automation-rules", None, "List Automation Rules"),
        
        # 20. Bot Flows
        ("GET", "/bot-flows", None, "List Bot Flows"),
        
        # 21. Campaigns
        ("GET", "/campaigns", None, "List Campaigns"),
    ]

    passed = 0
    failed = 0

    for method, path, body, desc in tests:
        status, res = api_call(path, method, body, token)
        if status in [200, 201, 204]:
            print(f"PASS: [{status}] {desc} ({method} {path})")
            passed += 1
        elif status == 409 and ("already exists" in str(res) or "unique" in str(res).lower()):
            print(f"PASS (Existing): [{status}] {desc} ({method} {path})")
            passed += 1
        else:
            print(f"FAIL: [{status}] {desc} ({method} {path}) -> {res}")
            failed += 1

    print(f"\nAPI CRUD AUDIT SUMMARY: {passed} passed, {failed} failed out of {len(tests)}")

if __name__ == "__main__":
    main()
