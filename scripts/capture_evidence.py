import sys
import time
from playwright.sync_api import sync_playwright

BASE_FE = "http://localhost:3000"
BASE_BE = "http://127.0.0.1:8000"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("[1/10] Capturing Admin Dashboard...")
        page.goto(f"{BASE_FE}/login")
        page.wait_for_selector("input[type='email']")
        page.fill("input[type='email']", "admin@demo.com")
        page.fill("input[type='password']", "demo1234")
        page.click("button[type='submit']")
        page.wait_for_url(f"{BASE_FE}/admin", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path="docs/evidence/01_admin_dashboard.png")

        print("[2/10] Capturing Admin Inbox...")
        page.goto(f"{BASE_FE}/admin/conversations")
        page.wait_for_selector("aside[aria-label='Conversation list']")
        page.wait_for_timeout(2000)
        # Select first conversation if available
        cards = page.locator("button[aria-label][aria-selected]")
        if cards.count() > 0:
            cards.first.click()
            page.wait_for_timeout(1500)
        page.screenshot(path="docs/evidence/02_admin_inbox.png")

        print("[3/10] Logging in as Agent & capturing Agent Inbox...")
        # Clear storage / cookies
        context.clear_cookies()
        page.evaluate("localStorage.clear()")
        page.goto(f"{BASE_FE}/login")
        page.wait_for_selector("input[type='email']")
        page.fill("input[type='email']", "agent@demo.com")
        page.fill("input[type='password']", "demo1234")
        page.click("button[type='submit']")
        page.wait_for_url(f"{BASE_FE}/agent", timeout=10000)
        page.wait_for_timeout(2000)
        page.screenshot(path="docs/evidence/03_agent_inbox.png")

        print("[4/10] Capturing Agent Conversation Timeline...")
        cards = page.locator("button[aria-label][aria-selected]")
        if cards.count() > 0:
            cards.first.click()
            page.wait_for_timeout(1500)
        # Toggle private note to show visual hierarchy
        note_btn = page.locator("button:has-text('Private Note')")
        if note_btn.count() > 0:
            note_btn.first.click()
            page.wait_for_timeout(500)
        page.screenshot(path="docs/evidence/04_agent_conversation.png")

        print("[5/10] Capturing Agent Customer Details...")
        # Toggle details sections to expand them
        for sec in ["Contact Information", "Time Logs", "To-do", "Customer Properties"]:
            btn = page.locator(f"button:has-text('{sec}')")
            if btn.count() > 0:
                btn.first.click()
                page.wait_for_timeout(300)
        page.screenshot(path="docs/evidence/05_agent_customer_details.png")

        print("[6/10] Capturing Agent Availability Toggle...")
        avail_btn = page.locator("button[aria-label*='click to go']")
        if avail_btn.count() > 0:
            avail_btn.first.click()
            page.wait_for_timeout(1000)
        page.screenshot(path="docs/evidence/06_agent_availability.png")
        # Click back to online
        if avail_btn.count() > 0:
            avail_btn.first.click()
            page.wait_for_timeout(500)

        print("[7/10] Opening Customer Widget host page...")
        widget_page = context.new_page()
        widget_page.goto(f"{BASE_FE}/widget-test.html")
        widget_page.wait_for_timeout(2000)
        # Click widget launcher (injected by embed.js: #ocw-launch)
        launcher = widget_page.locator("#ocw-launch")
        if launcher.count() > 0:
            launcher.first.click()
            widget_page.wait_for_timeout(1000)
        widget_page.screenshot(path="docs/evidence/07_customer_widget.png")

        print("[8/10] Testing Widget AI Response...")
        start_btn = widget_page.locator("#ocw-start, #ocw-start2")
        if start_btn.count() > 0:
            start_btn.first.click()
            widget_page.wait_for_timeout(1500)
        msg_input = widget_page.locator("#ocw-text")
        if msg_input.count() > 0:
            msg_input.first.fill("How do I contact support?")
            widget_page.locator("#ocw-send").first.click()
            widget_page.wait_for_timeout(4000)
        widget_page.screenshot(path="docs/evidence/08_ai_response.png")

        print("[9/10] Requesting Human Handover in Widget...")
        human_btn = widget_page.locator("#ocw-human")
        if human_btn.count() > 0:
            human_btn.first.click()
            widget_page.wait_for_timeout(3000)
        widget_page.screenshot(path="docs/evidence/09_human_handover.png")

        print("[10/10] Capturing Agent Reply & Note...")
        page.bring_to_front()
        page.reload()
        page.wait_for_timeout(2000)
        # Select first conversation
        cards = page.locator("button[aria-label][aria-selected]")
        if cards.count() > 0:
            cards.first.click()
            page.wait_for_timeout(1000)
        page.screenshot(path="docs/evidence/10_agent_reply.png")

        browser.close()
        print("All 10 evidence screenshots captured successfully!")

if __name__ == "__main__":
    run()
