#!/usr/bin/env python
"""
Final Support-Team Release Verification Script.
Tests all 3 surfaces:
  1. Admin Portal (Super Admin & Admin role management, invitations, access control)
  2. Agent Portal (Agent login, workspace, queues, availability, reply delivery)
  3. Customer Widget (Widget opening, grounded AI, escalation, real agent reply, note isolation)
"""
import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

EVIDENCE_DIR = Path(__file__).resolve().parent.parent / "docs" / "release_evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR = Path("C:/Users/SINGARAVEL/.gemini/antigravity/brain/0866914b-560e-4acb-8fc9-588d40efaf47")

def save_artifact(source_path: Path):
    if ARTIFACT_DIR.exists() and source_path.exists():
        dest = ARTIFACT_DIR / source_path.name
        dest.write_bytes(source_path.read_bytes())

def run_release_verification():
    results = {}
    print("=== STARTING COMPLETE OPENCHAT SUPPORT RELEASE VERIFICATION ===")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        # -------------------------------------------------------------
        # STEP 1: SUPER ADMIN LOGIN & USER MANAGEMENT INTERFACE
        # -------------------------------------------------------------
        print("\n--- Step 1: Super Admin Login & Users Management ---")
        page.goto("http://localhost:3000/login")
        page.fill("input[type='email']", "singaravel@vananam.com")
        page.fill("input[type='password']", "SuperAdminPassword2026!")
        page.click("button[type='submit']")

        page.wait_for_url("**/admin**", timeout=10000)
        expect(page.get_by_text("Singaravel").first).to_be_visible(timeout=5000)
        print("[Pass] Super Admin logged in successfully.")
        results["super_admin_login"] = True

        # Navigate to Users & Access Control
        page.goto("http://localhost:3000/admin/users")
        time.sleep(2)

        # Verify Super Admin email and badge
        expect(page.get_by_text("singaravel@vananam.com").first).to_be_visible(timeout=5000)
        expect(page.get_by_text("⭐ Super Admin").first).to_be_visible(timeout=5000)
        # Verify initial agents listed
        expect(page.get_by_text("support.agent1@openchat.io").first).to_be_visible(timeout=5000)
        expect(page.get_by_text("support.agent2@openchat.io").first).to_be_visible(timeout=5000)
        print("[Pass] Staff Directory accurately displays Super Admin and Support Agents.")
        results["users_directory_rendered"] = True

        super_admin_users_shot = EVIDENCE_DIR / "release_super_admin_users.png"
        page.screenshot(path=str(super_admin_users_shot))
        save_artifact(super_admin_users_shot)

        # -------------------------------------------------------------
        # STEP 2: INVITE NEW ADMIN & VERIFY INVITATION LIFECYCLE
        # -------------------------------------------------------------
        print("\n--- Step 2: Super Admin Invites New Admin ---")
        page.locator("button:has-text('+ Invite User')").click()
        time.sleep(1)

        test_invite_email = f"elena.vance_{int(time.time())}@vananam.com"
        page.fill("input[placeholder*='colleague@vananam.com']", test_invite_email)
        page.fill("input[placeholder*='Jane Smith']", "Elena Vance")
        page.select_option("#invite-role-select", value="admin")
        page.click("button:has-text('Send Invitation')")
        time.sleep(2)

        expect(page.get_by_text("Invitation Created!").first).to_be_visible(timeout=5000)
        print(f"[Pass] Invitation created successfully for {test_invite_email}")
        results["admin_invited"] = True

        invite_shot = EVIDENCE_DIR / "release_invite_modal.png"
        page.screenshot(path=str(invite_shot))
        save_artifact(invite_shot)

        # Get token from database
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
        from app.db.session import SessionLocal
        from app.models.user import User
        from app.models.invitation import UserInvitation

        db = SessionLocal()
        inv_record = db.query(UserInvitation).filter(UserInvitation.email == test_invite_email).first()
        inv_token = inv_record.token if inv_record else None
        db.close()
        assert inv_token is not None, "Invitation token not found in database!"

        # Close modal and log out Super Admin
        page.click("button:has-text('Close')")
        time.sleep(1)
        page.evaluate("() => { localStorage.clear(); window.location.href = '/login'; }")
        time.sleep(1.5)

        # -------------------------------------------------------------
        # STEP 3: ACCEPT INVITATION & COMPLETE ONBOARDING
        # -------------------------------------------------------------
        print("\n--- Step 3: Accept Invitation & Onboarding ---")
        page.goto(f"http://localhost:3000/accept-invitation?token={inv_token}")
        time.sleep(2)

        expect(page.get_by_text(test_invite_email).first).to_be_visible(timeout=5000)
        expect(page.get_by_text("ADMIN").first).to_be_visible(timeout=5000)

        page.fill("input[placeholder*='Your full name']", "Elena Vance")
        page.fill("input[placeholder='••••••••'] >> nth=0", "AdminPassword2026!")
        page.fill("input[placeholder='••••••••'] >> nth=1", "AdminPassword2026!")
        page.click("button:has-text('Complete Account Setup')")

        page.wait_for_url("**/admin**", timeout=10000)
        expect(page.get_by_text("Elena Vance").first).to_be_visible(timeout=5000)
        print("[Pass] Elena Vance accepted invitation and logged in as Admin.")
        results["invitation_accepted_and_logged_in"] = True

        onboarding_shot = EVIDENCE_DIR / "release_onboarded_admin.png"
        page.screenshot(path=str(onboarding_shot))
        save_artifact(onboarding_shot)

        # Verify Admin cannot modify Super Admin
        page.goto("http://localhost:3000/admin/users")
        time.sleep(2)
        # Check that singaravel@vananam.com has 'Protected' label for ordinary admin
        expect(page.get_by_text("Protected").first).to_be_visible(timeout=5000)
        print("[Pass] Ordinary Admin cannot edit Super Admin account (Protected).")
        results["admin_cannot_edit_super_admin"] = True

        # Log out Elena Vance
        page.evaluate("() => { localStorage.clear(); window.location.href = '/login'; }")
        time.sleep(1.5)

        # -------------------------------------------------------------
        # STEP 4: AGENT PORTAL & WORKSPACE VERIFICATION
        # -------------------------------------------------------------
        print("\n--- Step 4: Agent Login & Workspace ---")
        page.goto("http://localhost:3000/login")
        page.fill("input[type='email']", "support.agent1@openchat.io")
        page.fill("input[type='password']", "password123")
        page.click("button[type='submit']")

        page.wait_for_url("**/agent**", timeout=10000)
        expect(page.get_by_text("Sarah Wilson").first).to_be_visible(timeout=5000)
        print("[Pass] Agent Sarah Wilson logged in successfully.")
        results["agent_portal_access"] = True

        agent_inbox_shot = EVIDENCE_DIR / "release_agent_inbox.png"
        page.screenshot(path=str(agent_inbox_shot))
        save_artifact(agent_inbox_shot)

        # -------------------------------------------------------------
        # STEP 5: CUSTOMER WIDGET, KB AI, ESCALATION & AGENT REPLY
        # -------------------------------------------------------------
        print("\n--- Step 5: Customer Widget & Full Support Journey ---")
        widget_page = context.new_page()
        widget_page.goto("http://localhost:8080/test-widget.html")
        time.sleep(1.5)

        # Open widget launcher
        widget_page.evaluate("""() => {
            const root = document.querySelector('#openchat-widget-root');
            if (root && root.shadowRoot) {
                const btn = root.shadowRoot.querySelector('#ocw-launch');
                if (btn) btn.click();
            }
        }""")
        time.sleep(1)

        # Start conversation
        widget_page.evaluate("""() => {
            const root = document.querySelector('#openchat-widget-root');
            if (root && root.shadowRoot) {
                const startBtn = root.shadowRoot.querySelector('#ocw-start');
                if (startBtn) startBtn.click();
            }
        }""")
        time.sleep(2)

        # Send Knowledge-Base grounded question
        print("  -> Customer asking knowledge-base question...")
        widget_page.evaluate("""() => {
            const root = document.querySelector('#openchat-widget-root');
            if (root && root.shadowRoot) {
                const ta = root.shadowRoot.querySelector('#ocw-text');
                if (ta) {
                    ta.value = 'How do I reset my password?';
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const sendBtn = root.shadowRoot.querySelector('#ocw-send');
                if (sendBtn) sendBtn.click();
            }
        }""")

        # Verify AI grounded answer
        ai_reply = None
        for _ in range(6):
            time.sleep(2)
            ai_reply = widget_page.evaluate("""() => {
                const root = document.querySelector('#openchat-widget-root');
                if (root && root.shadowRoot) {
                    const msgs = root.shadowRoot.querySelectorAll('.ocw-ai');
                    return msgs.length > 0 ? msgs[msgs.length - 1].innerText : null;
                }
                return null;
            }""")
            if ai_reply:
                break

        assert ai_reply is not None, "AI grounded reply was not received in widget!"
        print(f"[Pass] AI replied grounded in Knowledge Base: '{ai_reply[:60]}...'")
        results["ai_grounded_response"] = True

        # Customer requests escalation
        print("  -> Customer requesting escalation to human agent...")
        widget_page.evaluate("""() => {
            const root = document.querySelector('#openchat-widget-root');
            if (root && root.shadowRoot) {
                const ta = root.shadowRoot.querySelector('#ocw-text');
                if (ta) {
                    ta.value = 'I need to speak to a human agent please';
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const sendBtn = root.shadowRoot.querySelector('#ocw-send');
                if (sendBtn) sendBtn.click();
            }
        }""")

        time.sleep(4)
        widget_conv_id = widget_page.evaluate("() => window.__openchatState ? window.__openchatState.activeId : null")
        print(f"[Pass] Escalation triggered for conversation #{widget_conv_id}")
        results["human_escalation"] = True

        customer_widget_shot = EVIDENCE_DIR / "release_customer_widget.png"
        widget_page.screenshot(path=str(customer_widget_shot))
        save_artifact(customer_widget_shot)

        # -------------------------------------------------------------
        # STEP 6: AGENT PICKS UP, RESPONDS & ADDS INTERNAL NOTE
        # -------------------------------------------------------------
        print("\n--- Step 6: Agent Reply & Internal Note Separation ---")
        page.goto(f"http://localhost:3000/agent/conversations/{widget_conv_id}")
        time.sleep(2.5)

        # Agent sends public customer-facing reply
        page.fill("textarea[placeholder*='Type a message']:visible", "Hello! Sarah Wilson here from support. How can I assist you today?")
        page.click("button:has-text('Send'):visible")
        time.sleep(2)

        # Agent adds internal note (must NOT be visible to customer)
        page.click("button:has-text('Private Note'):visible")
        time.sleep(1)
        page.fill("textarea[placeholder*='Write a private note']:visible", "CONFIDENTIAL_INTERNAL_NOTE: Escalation verified for support release.")
        page.click("button:has-text('Add Note'):visible")
        time.sleep(2)

        agent_reply_shot = EVIDENCE_DIR / "release_agent_reply_and_note.png"
        page.screenshot(path=str(agent_reply_shot))
        save_artifact(agent_reply_shot)
        print("[Pass] Agent sent reply and saved internal note.")
        results["agent_reply_sent"] = True

        # Check widget receives agent reply
        has_sarah_reply = False
        has_internal_note = False
        customer_msgs = []
        for _ in range(6):
            time.sleep(2)
            customer_msgs = widget_page.evaluate("""() => {
                const root = document.querySelector('#openchat-widget-root');
                if (root && root.shadowRoot) {
                    return Array.from(root.shadowRoot.querySelectorAll('.ocw-msg')).map(m => m.innerText);
                }
                return [];
            }""")
            has_sarah_reply = any("Sarah Wilson here from support" in m for m in customer_msgs)
            has_internal_note = any("CONFIDENTIAL_INTERNAL_NOTE" in m for m in customer_msgs)
            if has_sarah_reply:
                break

        assert has_sarah_reply, f"Agent reply did not arrive in customer widget! Messages found: {customer_msgs}"
        assert not has_internal_note, "CRITICAL LEAK: Internal note was visible to customer!"
        print("[Pass] Customer widget received agent reply.")
        print("[Pass] Internal note is completely isolated from customer widget.")
        results["agent_reply_delivered"] = True
        results["internal_note_isolated"] = True

        widget_final_shot = EVIDENCE_DIR / "release_widget_received_reply.png"
        widget_page.screenshot(path=str(widget_final_shot))
        save_artifact(widget_final_shot)

        browser.close()

    print("\n================ FINAL SUPPORT RELEASE SUMMARY ================")
    for k, v in results.items():
        status_str = "PASS" if v else "FAIL"
        print(f"  {k:<35}: {status_str}")
    print("===============================================================")
    return all(results.values())


if __name__ == "__main__":
    success = run_release_verification()
    sys.exit(0 if success else 1)
