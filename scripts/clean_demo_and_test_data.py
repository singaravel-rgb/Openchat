#!/usr/bin/env python
"""
Clean demo and test data from OpenChat database.
Safely preserves knowledge base, operational configuration, and legitimate support staff.
"""
import sys
import argparse
from pathlib import Path

backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation, ConversationLink
from app.models.message import Message
from app.models.attachment import Attachment
from app.models.conversation_task import ConversationTask
from app.models.csat import CSATRating
from app.models.notification import Notification
from app.models.widget import WidgetSession
from app.models.knowledge import Article, Category, FAQ
from app.models.setting import Setting
from app.models.team import user_team_membership

# Support team accounts to PRESERVE
PRESERVED_USER_EMAILS = {
    "support.agent1@openchat.io",
    "support.agent2@openchat.io",
    "singaravel@vananam.com",
}

def preview_cleanup():
    db = SessionLocal()
    try:
        all_users = db.query(User).all()
        preserved = [u for u in all_users if u.email in PRESERVED_USER_EMAILS]
        to_delete = [u for u in all_users if u.email not in PRESERVED_USER_EMAILS]
        to_delete_ids = [u.id for u in to_delete]

        print("================ CLEANUP PREVIEW ================")
        print(f"PRESERVED USERS ({len(preserved)}):")
        for u in preserved:
            print(f"  [KEEP] ID={u.id} {u.email} ({u.full_name}, {u.role})")

        print(f"\nUSERS TO DELETE ({len(to_delete)}):")
        roles = {}
        domains = {}
        for u in to_delete:
            roles[u.role] = roles.get(u.role, 0) + 1
            domain = u.email.split("@")[-1] if "@" in u.email else "no_domain"
            domains[domain] = domains.get(domain, 0) + 1

        print("  By Role:")
        for r, count in sorted(roles.items()):
            print(f"    - {r}: {count}")
        print("  By Domain:")
        for d, count in sorted(domains.items()):
            print(f"    - @{d}: {count}")

        conv_count = db.query(Conversation).count()
        msg_count = db.query(Message).count()
        task_count = db.query(ConversationTask).count()
        link_count = db.query(ConversationLink).count()
        csat_count = db.query(CSATRating).count()
        attach_count = db.query(Attachment).count()
        notif_count = db.query(Notification).filter(Notification.user_id.in_(to_delete_ids)).count() if to_delete_ids else 0

        print("\nTEST RECORDS TO PURGE:")
        print(f"  - Conversations: {conv_count}")
        print(f"  - Messages: {msg_count}")
        print(f"  - Conversation Tasks: {task_count}")
        print(f"  - Conversation Links: {link_count}")
        print(f"  - CSAT Ratings: {csat_count}")
        print(f"  - Attachments: {attach_count}")
        print(f"  - Test Notifications: {notif_count}")

        print("\nPRESERVED OPERATIONAL ASSETS:")
        print(f"  - Categories: {db.query(Category).count()}")
        print(f"  - Knowledge Base Articles: {db.query(Article).count()}")
        print(f"  - FAQs: {db.query(FAQ).count()}")
        print(f"  - Settings: {db.query(Setting).count()}")
        print("=================================================")
    finally:
        db.close()


def execute_cleanup():
    db = SessionLocal()
    try:
        # 1. Identify preserved staff user for reassigning knowledge base articles
        preserved_agent = db.query(User).filter(User.email == "support.agent1@openchat.io").first()
        if not preserved_agent:
            print("ERROR: support.agent1@openchat.io not found! Cannot proceed safely.")
            return False

        # 2. Reassign article author_id to preserved agent
        articles = db.query(Article).all()
        for a in articles:
            a.author_id = preserved_agent.id
        db.commit()
        print(f"Safely reassigned {len(articles)} articles to {preserved_agent.email}")

        # 3. Identify all test users to delete
        all_users = db.query(User).all()
        to_delete_users = [u for u in all_users if u.email not in PRESERVED_USER_EMAILS]
        to_delete_ids = [u.id for u in to_delete_users]

        print(f"Deleting test conversation-related records for {len(to_delete_ids)} test users...")

        # 4. Delete conversation dependent entities
        db.query(ConversationLink).delete(synchronize_session=False)
        db.query(ConversationTask).delete(synchronize_session=False)
        db.query(CSATRating).delete(synchronize_session=False)
        db.query(Attachment).delete(synchronize_session=False)
        db.query(Message).delete(synchronize_session=False)
        db.query(Conversation).delete(synchronize_session=False)

        # 5. Delete test user dependent entities
        db.query(WidgetSession).filter(WidgetSession.user_id.in_(to_delete_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.user_id.in_(to_delete_ids)).delete(synchronize_session=False)
        db.query(AgentProfile).filter(AgentProfile.user_id.in_(to_delete_ids)).delete(synchronize_session=False)

        # 6. Delete test users
        deleted_users_count = db.query(User).filter(User.id.in_(to_delete_ids)).delete(synchronize_session=False)
        db.commit()

        print(f"Successfully deleted {deleted_users_count} test/demo users.")
        print(f"Purged test conversations, messages, links, tasks, CSAT ratings, and attachments.")

        # 7. Reset active conversation counter for preserved agents
        for agent_email in ["support.agent1@openchat.io", "support.agent2@openchat.io"]:
            agent = db.query(User).filter(User.email == agent_email).first()
            if agent and agent.agent_profile:
                agent.agent_profile.active_conversations = 0
                agent.agent_profile.is_available = True
        db.commit()
        print("Reset active conversation counters to 0 for remaining support team agents.")
        return True
    except Exception as e:
        db.rollback()
        print(f"Error executing cleanup: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean demo and test data.")
    parser.add_argument("--execute", action="store_true", help="Execute the deletion")
    args = parser.parse_args()

    if args.execute:
        execute_cleanup()
    else:
        preview_cleanup()

