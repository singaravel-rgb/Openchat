from playwright.sync_api import sync_playwright

RESOLUTIONS = [
    (1920, 1080, "1920x1080"),
    (1927, 969, "1927x969"),
    (1842, 893, "1842x893"),
    (1366, 768, "1366x768"),
]

BASE_FE = "http://localhost:3000"

def test_res():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for width, height, name in RESOLUTIONS:
            print(f"Testing resolution: {name} ({width}x{height})...")
            context = browser.new_context(viewport={"width": width, "height": height})
            page = context.new_page()

            # Test Agent Workspace
            page.goto(f"{BASE_FE}/login")
            page.wait_for_selector("input[type='email']")
            page.fill("input[type='email']", "agent@demo.com")
            page.fill("input[type='password']", "demo1234")
            page.click("button[type='submit']")
            page.wait_for_url(f"{BASE_FE}/agent", timeout=10000)
            page.wait_for_timeout(1500)

            # Check horizontal overflow on body
            has_overflow = page.evaluate("() => document.body.scrollWidth > window.innerWidth")
            print(f"  [{name}] Agent body horizontal overflow: {has_overflow}")

            # Select a conversation if available
            cards = page.locator("button[aria-label][aria-selected]")
            if cards.count() > 0:
                cards.first.click()
                page.wait_for_timeout(1000)

            page.screenshot(path=f"docs/evidence/resolutions/agent_{name}.png")

            # Test Admin Inbox
            context.clear_cookies()
            page.evaluate("localStorage.clear()")
            page.goto(f"{BASE_FE}/login")
            page.wait_for_selector("input[type='email']")
            page.fill("input[type='email']", "admin@demo.com")
            page.fill("input[type='password']", "demo1234")
            page.click("button[type='submit']")
            page.wait_for_url(f"{BASE_FE}/admin", timeout=10000)
            page.goto(f"{BASE_FE}/admin/conversations")
            page.wait_for_selector("aside[aria-label='Conversation list']")
            page.wait_for_timeout(1500)

            admin_overflow = page.evaluate("() => document.body.scrollWidth > window.innerWidth")
            print(f"  [{name}] Admin Inbox body horizontal overflow: {admin_overflow}")

            page.screenshot(path=f"docs/evidence/resolutions/admin_inbox_{name}.png")
            context.close()

        browser.close()
        print("All resolution tests complete!")

if __name__ == "__main__":
    test_res()

