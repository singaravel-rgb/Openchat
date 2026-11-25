"""commercial platform enhancements

Revision ID: p25enhancements001
Revises: p24userreads001
Create Date: 2026-11-25

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "p25enhancements001"
down_revision: Union[str, None] = "p24userreads001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_col(insp, table: str, col: str) -> bool:
    return col in [c["name"] for c in insp.get_columns(table)]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    # 1. AgentProfile 3-state availability & admin override
    if "agent_profiles" in tables:
        if not _has_col(insp, "agent_profiles", "availability_status"):
            op.add_column("agent_profiles", sa.Column("availability_status", sa.String(20), server_default="available", nullable=False))
            op.execute("UPDATE agent_profiles SET availability_status = CASE WHEN is_available THEN 'available' ELSE 'offline' END")
        if not _has_col(insp, "agent_profiles", "admin_forced_offline"):
            op.add_column("agent_profiles", sa.Column("admin_forced_offline", sa.Boolean(), server_default=sa.text("false"), nullable=False))
        if not _has_col(insp, "agent_profiles", "pause_auto_assignment"):
            op.add_column("agent_profiles", sa.Column("pause_auto_assignment", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    # 2. Conversation optimistic locking version
    if "conversations" in tables:
        if not _has_col(insp, "conversations", "version"):
            op.add_column("conversations", sa.Column("version", sa.Integer(), server_default="1", nullable=False))

    # 3. Users password_changed_at & notification_preferences
    if "users" in tables:
        if not _has_col(insp, "users", "password_changed_at"):
            op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
        if not _has_col(insp, "users", "notification_preferences"):
            op.add_column("users", sa.Column("notification_preferences", sa.JSON(), nullable=True))

    # 4. Notifications email tracking & dedup_key + enum values
    if "notifications" in tables:
        if not _has_col(insp, "notifications", "email_sent"):
            op.add_column("notifications", sa.Column("email_sent", sa.Boolean(), server_default=sa.text("false"), nullable=False))
        if not _has_col(insp, "notifications", "email_status"):
            op.add_column("notifications", sa.Column("email_status", sa.String(40), server_default="not_applicable", nullable=False))
        if not _has_col(insp, "notifications", "dedup_key"):
            op.add_column("notifications", sa.Column("dedup_key", sa.String(160), nullable=True))
            op.create_index("ix_notifications_dedup_key", "notifications", ["dedup_key"])

        if bind.dialect.name == "postgresql":
            for val in ("conversation_reassigned", "conversation_pending"):
                op.execute(f"ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS '{val}'")

    # 5. CannedResponse is_shared
    if "canned_responses" in tables:
        if not _has_col(insp, "canned_responses", "is_shared"):
            op.add_column("canned_responses", sa.Column("is_shared", sa.Boolean(), server_default=sa.text("true"), nullable=False))

    # 6. Configurable Tags table + default seed
    if "tags" not in tables:
        op.create_table(
            "tags",
            sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
            sa.Column("name", sa.String(80), unique=True, nullable=False),
            sa.Column("color", sa.String(30), server_default="#3b82f6", nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_tags_name", "tags", ["name"], unique=True)
        op.execute(
            """
            INSERT INTO tags (name, color, description, is_active) VALUES
            ('Payment', '#10b981', 'Billing and payment inquiries', true),
            ('Refund', '#f59e0b', 'Refund and cancellation requests', true),
            ('Technical Issue', '#6366f1', 'Bugs, errors, and technical troubleshooting', true),
            ('Account', '#0ea5e9', 'Account access, profile, and settings', true),
            ('Urgent', '#ef4444', 'Time-sensitive issues requiring immediate attention', true),
            ('Follow-up', '#8b5cf6', 'Requires follow-up action', true)
            """
        )


def downgrade() -> None:
    pass
