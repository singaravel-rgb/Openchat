from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import settings
from app.db.base import Base
from app.models.user import User
from app.models.conversation import Conversation, ConversationLink
from app.models.message import Message
from app.models.agent_profile import AgentProfile
from app.models.csat import CSATRating
from app.models.audit_log import AuditLog
from app.models.knowledge import Category, Article, FAQ
from app.models.notification import Notification
from app.models.widget import WidgetConfig, WidgetSession
from app.models.ai import AIConfig, AIUsageLog
from app.models.setting import Setting
from app.models.attachment import Attachment
from app.models.canned_response import CannedResponse
from app.models.custom_field import CustomField, ConversationCustomField
from app.models.team import Department, Team, user_team_membership
from app.models.business_hours import BusinessHours, Holiday
from app.models.bot_flow import BotFlow, BotFlowIssue, BotFlowStep
from app.models.webhook import Webhook, WebhookDelivery
from app.models.automation_rule import AutomationRule, AutomationRuleExecution
from app.models.campaign import Campaign, CampaignMessage
from app.models.conversation_task import ConversationTask
from app.models.password_reset import PasswordResetToken
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

custom_url = config.get_main_option("sqlalchemy.url")
db_url_obj = settings.database_url
db_url_rendered = db_url_obj.render_as_string(hide_password=False) if hasattr(db_url_obj, "render_as_string") else str(db_url_obj)

if not custom_url or "driver://user:pass@localhost/dbname" in custom_url:
    config.set_main_option(
        "sqlalchemy.url",
        db_url_rendered.replace("%", "%%"),
    )


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url") or db_url_rendered

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
