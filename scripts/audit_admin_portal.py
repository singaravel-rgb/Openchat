import asyncio
import json
from playwright.async_api import async_playwright

ADMIN_PAGES = [
    ("/admin", "Dashboard"),
    ("/admin/conversations", "Conversations"),
    ("/admin/agents", "Agents"),
    ("/admin/teams", "Teams"),
    ("/admin/categories", "Categories"),
    ("/admin/articles", "Articles"),
    ("/admin/faqs", "FAQs"),
    ("/admin/reports", "Reports"),
    ("/admin/sla", "SLA"),
    ("/admin/audit-logs", "Audit Logs"),
    ("/admin/settings", "General Settings"),
    ("/admin/settings/ai", "AI Configuration"),
    ("/admin/settings/widget", "Widget Configuration"),
    ("/admin/settings/rules", "Assignment Rules"),
    ("/admin/settings/notifications", "Notifications"),
    ("/admin/canned-responses", "Canned Responses"),
    ("/admin/custom-fields", "Custom Fields"),
    ("/admin/business-hours", "Business Hours"),
    ("/admin/webhooks", "Webhooks"),
    ("/admin/automation-rules", "Automation Rules"),
    ("/admin/bot-flows", "Bot Flows"),
    ("/admin/campaigns", "Campaigns"),
]

async def audit():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        failed_requests = []
        console_errors = []

        page.on("requestfailed", lambda req: failed_requests.append(f"{req.method} {req.url} FAILED"))
        def handle_response(res):
            if res.status >= 400 and "/api/" in res.url:
                failed_requests.append(f"{res.request.method} {res.url} -> {res.status}")
        page.on("response", handle_response)
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # 1. Login
        print("Logging in as Admin...")
        await page.goto("http://localhost:3000/login")
        await page.fill("input[type='email']", "admin@demo.com")
        await page.fill("input[type='password']", "demo1234")
        await page.click("button[type='submit']")
        await page.wait_for_url("**/admin**", timeout=8000)
        print("Logged in successfully. Starting page audit...\n")

        audit_results = []

        for path, name in ADMIN_PAGES:
            failed_requests.clear()
            console_errors.clear()

            url = f"http://localhost:3000{path}"
            try:
                resp = await page.goto(url, wait_until="networkidle", timeout=10000)
                await page.wait_for_timeout(1000)

                # Check if page has error banner
                body_text = await page.inner_text("body")
                has_error_text = any(
                    err_word in body_text.lower()
                    for err_word in ["failed to load", "failed to fetch", "something went wrong", "internal server error"]
                )

                # Check for buttons, inputs
                buttons_count = await page.locator("button").count()
                inputs_count = await page.locator("input, select, textarea").count()

                status_code = resp.status if resp else "Unknown"

                result = {
                    "path": path,
                    "name": name,
                    "status_code": status_code,
                    "has_error_text": has_error_text,
                    "failed_api_calls": list(failed_requests),
                    "console_errors": list(console_errors),
                    "buttons_count": buttons_count,
                    "inputs_count": inputs_count,
                    "content_preview": body_text[:200].replace("\n", " "),
                }
                audit_results.append(result)
                
                print(f"[{'PASS' if not failed_requests and not console_errors and not has_error_text else 'FAIL'}] {name} ({path})")
                if failed_requests:
                    print(f"   API Errors: {failed_requests}")
                if console_errors:
                    print(f"   JS Errors: {console_errors}")
                if has_error_text:
                    print(f"   Page displays error text!")
            except Exception as e:
                print(f"[EXCEPTION] {name} ({path}): {e}")
                audit_results.append({
                    "path": path,
                    "name": name,
                    "error": str(e),
                })

        with open("docs/admin_audit_results.json", "w") as f:
            json.dump(audit_results, f, indent=2)
        print("\nAudit complete. Results saved to docs/admin_audit_results.json")

        await browser.close()

asyncio.run(audit())
