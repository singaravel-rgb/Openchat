"""
Seed production-grade Knowledge Base Categories, Articles, and FAQs for OpenChat Staging.
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

backend_path = Path("backend").resolve()
sys.path.insert(0, str(backend_path))

from app.db.session import SessionLocal
from app.models.knowledge import Category, Article, FAQ
from app.models.user import User
from app.core.enums import ArticleStatus, ArticleVisibility

def seed_kb():
    db = SessionLocal()
    try:
        # 1. Super Admin Author
        admin = db.query(User).filter(User.role == "super_admin").first()
        if not admin:
            admin = db.query(User).filter(User.email == "singaravel@vananam.com").first()
        if not admin:
            admin = db.query(User).order_by(User.id.asc()).first()
        admin_id = admin.id if admin else 1

        now = datetime.now(timezone.utc)

        # 2. Categories
        categories_data = [
            {"name": "Getting Started", "slug": "getting-started", "description": "Platform overview, support hours, and contact details", "display_order": 1},
            {"name": "Billing & Payments", "slug": "billing-payments", "description": "Invoices, subscriptions, and payment methods", "display_order": 2},
            {"name": "Technical Support", "slug": "technical-support", "description": "API guides, rate limits, and integration details", "display_order": 3},
            {"name": "Account Management", "slug": "account-management", "description": "Password resets, profile updates, and security", "display_order": 4},
        ]

        cats = {}
        for cdata in categories_data:
            cat = db.query(Category).filter(Category.slug == cdata["slug"]).first()
            if not cat:
                cat = Category(
                    name=cdata["name"],
                    slug=cdata["slug"],
                    description=cdata["description"],
                    display_order=cdata["display_order"],
                    is_visible=True,
                )
                db.add(cat)
                db.flush()
                print(f"[+] Created category: {cat.name}")
            cats[cdata["slug"]] = cat

        # 3. FAQs
        faqs_data = [
            {
                "question": "How do I contact support?",
                "answer": "You can contact support by clicking the chat widget in the bottom right corner of any page. Our AI assistant will help you immediately, and if needed, connect you with a human agent.",
                "category_id": cats["getting-started"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Chat with us",
                "display_order": 1,
            },
            {
                "question": "What are your support hours?",
                "answer": "Our AI assistant is available 24/7. Human agents are available Monday-Friday, 9 AM - 6 PM UTC. Outside these hours, your message will be queued and an agent will respond on the next business day.",
                "category_id": cats["getting-started"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Start a chat",
                "display_order": 2,
            },
            {
                "question": "How do I update my billing information?",
                "answer": "Go to Settings > Billing in your dashboard. You can update your payment method, billing address, and view past invoices there.",
                "category_id": cats["billing-payments"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Chat about billing",
                "display_order": 3,
            },
        ]

        for fdata in faqs_data:
            faq = db.query(FAQ).filter(FAQ.question == fdata["question"]).first()
            if not faq:
                faq = FAQ(**fdata)
                db.add(faq)
                print(f"[+] Created FAQ: {faq.question}")

        # 4. Articles
        articles_data = [
            {
                "title": "Welcome to OpenChat",
                "slug": "welcome-to-openchat",
                "content": (
                    "Welcome to OpenChat! OpenChat is an enterprise-grade customer support platform "
                    "featuring an AI-first conversational widget, seamless human agent handoff, "
                    "multi-channel inboxes, unified ticket queues, and knowledge base integration.\n\n"
                    "## Key Features\n"
                    "- 24/7 AI-Powered Support: Instant, grounded answers using Google Gemini.\n"
                    "- Live Agent Handoff: Intelligent routing based on agent availability and active chat capacity.\n"
                    "- Unified Inbox: Support agents can manage, reply, resolve, and reopen tickets seamlessly.\n"
                    "- Private Internal Notes: Collaborate securely without customer visibility.\n"
                    "- Full Audit Trail: Complete history tracking for role assignments, notes, and messages."
                ),
                "excerpt": "Overview of OpenChat customer support features, AI assistance, and agent workspaces.",
                "category_id": cats["getting-started"].id,
                "author_id": admin_id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": now,
            },
            {
                "title": "Understanding Your Invoice",
                "slug": "understanding-invoice",
                "content": (
                    "Your OpenChat invoice includes several transparent sections:\n\n"
                    "## Subscription Charges\nMonthly or annual fees for your selected platform plan.\n\n"
                    "## Usage Charges\nTransparent charges for conversation or API usage beyond plan allowances.\n\n"
                    "## Taxes & Billing Records\nTaxes calculated according to your registered company address.\n\n"
                    "## Billing Dispute & Refund Policy\n"
                    "All refund and billing dispute requests are subject to verification and human approval. "
                    "Our AI assistant cannot issue refunds directly. A member of our billing support team "
                    "will review your account and process verified refund requests."
                ),
                "excerpt": "Detailed breakdown of invoice sections, charges, taxes, and billing support policies.",
                "category_id": cats["billing-payments"].id,
                "author_id": admin_id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": now,
            },
            {
                "title": "API Authentication Guide",
                "slug": "api-authentication-guide",
                "content": (
                    "To integrate with the OpenChat REST API:\n\n"
                    "## Authentication Header\n"
                    "Include your API token in all requests:\n"
                    "```\nAuthorization: Bearer YOUR_API_KEY\n```\n\n"
                    "## Rate Limits\n"
                    "- Standard: 100 requests per minute\n"
                    "- Enterprise: 1,000 requests per minute\n\n"
                    "## Error Status Codes\n"
                    "- 401 Unauthorized: Invalid or missing token\n"
                    "- 403 Forbidden: Insufficient role permissions\n"
                    "- 429 Too Many Requests: Rate limit exceeded"
                ),
                "excerpt": "Comprehensive reference for REST API authentication, tokens, and rate limits.",
                "category_id": cats["technical-support"].id,
                "author_id": admin_id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": now,
            },
            {
                "title": "How to Reset Your Password",
                "slug": "reset-password",
                "content": (
                    "If you need to reset your account password:\n\n"
                    "1. Visit the OpenChat login page at `/login`.\n"
                    "2. Click the 'Forgot Password?' link.\n"
                    "3. Enter your registered business email address.\n"
                    "4. Open the secure reset link sent to your email (valid for 1 hour).\n"
                    "5. Choose a strong password containing at least 8 characters.\n\n"
                    "If you experience issues, an administrator can trigger a reset link from the Admin Portal."
                ),
                "excerpt": "Step-by-step guide to resetting your account password securely.",
                "category_id": cats["account-management"].id,
                "author_id": admin_id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": now,
            },
        ]

        for adata in articles_data:
            art = db.query(Article).filter(Article.slug == adata["slug"]).first()
            if not art:
                art = Article(**adata)
                db.add(art)
                print(f"[+] Created article: {art.title}")

        db.commit()
        print("[SUCCESS] Production Knowledge Base seeded successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_kb()
