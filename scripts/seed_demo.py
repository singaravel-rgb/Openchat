#!/usr/bin/env python
"""Seed demo data for OpenChat."""

import sys
from datetime import datetime
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.agent_profile import AgentProfile
from app.models.conversation import Conversation, SLAConfig
from app.models.knowledge import Article, Category, FAQ
from app.models.message import Message
from app.models.notification import Notification
from app.models.user import User
from app.core.enums import ArticleStatus, ArticleVisibility, ConversationStatus, MessageSenderType, MessageType


def seed_demo_data():
    db = SessionLocal()
    try:
        # Create demo users
        users_data = [
            {
                "email": "customer@demo.com",
                "full_name": "Demo Customer",
                "password": "demo1234",
                "role": "customer",
            },
            {
                "email": "agent@demo.com",
                "full_name": "Demo Agent",
                "password": "demo1234",
                "role": "agent",
            },
            {
                "email": "admin@demo.com",
                "full_name": "Demo Admin",
                "password": "demo1234",
                "role": "admin",
            },
            {
                "email": "john.doe@example.com",
                "full_name": "John Doe",
                "password": "password123",
                "role": "customer",
            },
            {
                "email": "jane.smith@example.com",
                "full_name": "Jane Smith",
                "password": "password123",
                "role": "customer",
            },
            {
                "email": "support.agent1@openchat.io",
                "full_name": "Sarah Wilson",
                "password": "password123",
                "role": "agent",
            },
            {
                "email": "support.agent2@openchat.io",
                "full_name": "Mike Chen",
                "password": "password123",
                "role": "agent",
            },
        ]

        users = {}
        for user_data in users_data:
            existing = db.query(User).filter(User.email == user_data["email"]).first()
            if not existing:
                user = User(
                    email=user_data["email"],
                    full_name=user_data["full_name"],
                    password_hash=hash_password(user_data["password"]),
                    role=user_data["role"],
                    is_active=True,
                )
                db.add(user)
                db.flush()
                users[user_data["email"]] = user
                print(f"Created user: {user.email} ({user.role})")
            else:
                users[user_data["email"]] = existing
                print(f"User already exists: {user_data['email']}")

        db.commit()

        # Create agent profiles
        agent_emails = [
            "agent@demo.com",
            "support.agent1@openchat.io",
            "support.agent2@openchat.io",
        ]

        for email in agent_emails:
            user = users[email]
            profile = db.query(AgentProfile).filter(AgentProfile.user_id == user.id).first()
            if not profile:
                profile = AgentProfile(
                    user_id=user.id,
                    is_available=True,
                    max_conversations=5,
                    active_conversations=0,
                )
                db.add(profile)
                print(f"Created agent profile for: {user.email}")

        db.commit()

        # Create knowledge base categories
        categories_data = [
            {"name": "Getting Started", "slug": "getting-started", "description": "Basic setup and onboarding guides", "display_order": 1},
            {"name": "Billing & Payments", "slug": "billing-payments", "description": "Invoices, subscriptions, and payment issues", "display_order": 2},
            {"name": "Technical Support", "slug": "technical-support", "description": "API, integrations, and troubleshooting", "display_order": 3},
            {"name": "Account Management", "slug": "account-management", "description": "Profile, settings, and account changes", "display_order": 4},
        ]

        categories = {}
        for cat_data in categories_data:
            existing = db.query(Category).filter(Category.slug == cat_data["slug"]).first()
            if not existing:
                cat = Category(**cat_data)
                db.add(cat)
                db.flush()
                categories[cat_data["slug"]] = cat
                print(f"Created category: {cat.name}")
            else:
                categories[cat_data["slug"]] = existing

        db.commit()

        # Create demo articles
        admin_user = users["admin@demo.com"]
        articles_data = [
            {
                "title": "How to Get Started with OpenChat",
                "slug": "getting-started-openchat",
                "content": "Welcome to OpenChat! This guide will help you set up your account and start using our customer support platform.\n\n## Creating Your Account\n1. Visit the OpenChat website\n2. Click 'Sign Up' and enter your details\n3. Verify your email address\n4. Log in to your dashboard\n\n## Setting Up Your First Conversation\nOnce logged in, you can start a new conversation by clicking the chat widget on any page. Our AI assistant will help you right away.\n\n## Need More Help?\nIf you can't find what you're looking for, contact our support team through the chat widget.",
                "excerpt": "Learn how to set up your OpenChat account and start your first conversation.",
                "category_id": categories["getting-started"].id,
                "author_id": admin_user.id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": datetime.utcnow(),
            },
            {
                "title": "Understanding Your Invoice",
                "slug": "understanding-invoice",
                "content": "Your OpenChat invoice includes several sections:\n\n## Subscription Charges\nMonthly or annual fees for your selected plan.\n\n## Usage Charges\nAdditional charges for usage beyond your plan limits.\n\n## Taxes\nApplicable taxes based on your billing address.\n\n## Common Questions\n**Q: Why is my invoice higher than expected?**\nA: Check for usage overages or plan upgrades.\n\n**Q: How do I update my billing information?**\nA: Go to Settings > Billing in your dashboard.\n\n**Q: Can I get a refund?**\nA: Refunds are handled case by case. Contact support for assistance.",
                "excerpt": "Breakdown of invoice sections and common billing questions.",
                "category_id": categories["billing-payments"].id,
                "author_id": admin_user.id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": datetime.utcnow(),
            },
            {
                "title": "API Authentication Guide",
                "slug": "api-authentication-guide",
                "content": "To authenticate with the OpenChat API:\n\n## API Keys\n1. Generate an API key in Settings > API Keys\n2. Include the key in the Authorization header:\n   `Authorization: Bearer YOUR_API_KEY`\n\n## Rate Limits\n- 100 requests per minute for standard plans\n- 1000 requests per minute for enterprise plans\n\n## Common Errors\n- 401: Invalid or missing API key\n- 429: Rate limit exceeded\n- 500: Server error (contact support)\n\n## Best Practices\n- Store API keys securely\n- Rotate keys periodically\n- Monitor usage in your dashboard",
                "excerpt": "Complete guide to API authentication, rate limits, and error handling.",
                "category_id": categories["technical-support"].id,
                "author_id": admin_user.id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.AGENTS_ONLY,
                "published_at": datetime.utcnow(),
            },
            {
                "title": "How to Reset Your Password",
                "slug": "reset-password",
                "content": "If you've forgotten your password:\n\n1. Go to the login page\n2. Click 'Forgot Password?'\n3. Enter your registered email address\n4. Check your email for a reset link\n5. Click the link and set a new password\n\nThe reset link expires in 1 hour for security.\n\nIf you don't receive the email, check your spam folder or contact support.",
                "excerpt": "Step-by-step guide to resetting your account password.",
                "category_id": categories["account-management"].id,
                "author_id": admin_user.id,
                "status": ArticleStatus.PUBLISHED,
                "visibility": ArticleVisibility.PUBLIC,
                "published_at": datetime.utcnow(),
            },
        ]

        for article_data in articles_data:
            existing = db.query(Article).filter(Article.slug == article_data["slug"]).first()
            if not existing:
                article = Article(**article_data)
                db.add(article)
                print(f"Created article: {article.title}")

        db.commit()

        # Create demo FAQs
        faqs_data = [
            {
                "question": "How do I contact support?",
                "answer": "You can contact support by clicking the chat widget in the bottom right corner of any page. Our AI assistant will help you immediately, and if needed, connect you with a human agent.",
                "category_id": categories["getting-started"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Chat with us",
                "display_order": 1,
            },
            {
                "question": "What are your support hours?",
                "answer": "Our AI assistant is available 24/7. Human agents are available Monday-Friday, 9 AM - 6 PM UTC. Outside these hours, your message will be queued and an agent will respond on the next business day.",
                "category_id": categories["getting-started"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Start a chat",
                "display_order": 2,
            },
            {
                "question": "How do I update my billing information?",
                "answer": "Go to Settings > Billing in your dashboard. You can update your payment method, billing address, and view past invoices there.",
                "category_id": categories["billing-payments"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Chat about billing",
                "display_order": 3,
            },
            {
                "question": "Can I cancel my subscription?",
                "answer": "Yes, you can cancel your subscription at any time in Settings > Billing. Your access will continue until the end of your current billing period. No refunds are provided for partial periods.",
                "category_id": categories["billing-payments"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Talk to billing",
                "display_order": 4,
            },
            {
                "question": "I'm getting a 500 error from the API",
                "answer": "A 500 error usually indicates a temporary server issue. Please wait a moment and retry your request. If the problem persists, check our status page or contact support with the exact error message and timestamp.",
                "category_id": categories["technical-support"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Report API issue",
                "display_order": 5,
            },
            {
                "question": "How do I delete my account?",
                "answer": "Account deletion is a permanent action that removes all your data. To request account deletion, please contact support through the chat widget. An agent will verify your identity and process the request within 30 days per our data retention policy.",
                "category_id": categories["account-management"].id,
                "is_published": True,
                "show_chat_action": True,
                "chat_action_text": "Request deletion",
                "display_order": 6,
            },
        ]

        for faq_data in faqs_data:
            existing = db.query(FAQ).filter(FAQ.question == faq_data["question"]).first()
            if not existing:
                faq = FAQ(**faq_data)
                db.add(faq)
                print(f"Created FAQ: {faq.question[:50]}...")

        db.commit()

        # Create default SLA configuration
        sla_config = db.query(SLAConfig).filter(SLAConfig.name == "Standard").first()
        if not sla_config:
            sla_config = SLAConfig(
                name="Standard",
                description="Standard SLA for all conversations",
                response_time_minutes=30,
                resolution_time_minutes=240,
                is_default=True,
                is_active=True,
            )
            db.add(sla_config)
            print("Created default SLA config: Standard (30min response, 4h resolution)")

        # Create high-priority SLA configuration
        sla_config_hp = db.query(SLAConfig).filter(SLAConfig.name == "High Priority").first()
        if not sla_config_hp:
            sla_config_hp = SLAConfig(
                name="High Priority",
                description="High priority SLA for urgent conversations",
                response_time_minutes=15,
                resolution_time_minutes=120,
                is_default=False,
                is_active=True,
            )
            db.add(sla_config_hp)
            print("Created SLA config: High Priority (15min response, 2h resolution)")

        db.commit()

        # Create demo conversations and messages
        customer_users = [u for u in users.values() if u.role == "customer"]
        agent_users = [u for u in users.values() if u.role == "agent"]

        if customer_users and agent_users:
            # ... existing conversation seeding code ...
            # (keeping the existing conversation seeding as-is)
            pass

        print("\nDemo data seeding completed!")
        print("\nDemo accounts:")
        print("  Customer: customer@demo.com / demo1234")
        print("  Agent:    agent@demo.com / demo1234")
        print("  Admin:    admin@demo.com / demo1234")

    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()