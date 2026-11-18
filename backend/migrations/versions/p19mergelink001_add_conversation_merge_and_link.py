"""add conversation merge and link models

Revision ID: p19mergelink001
Revises: p18gemini001
Create Date: 2026-11-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p19mergelink001"
down_revision: Union[str, None] = "p18gemini001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add merged_into_id to conversations if not present
    conv_cols = [c["name"] for c in insp.get_columns("conversations")]
    if "merged_into_id" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column(
                "merged_into_id",
                sa.Integer(),
                sa.ForeignKey("conversations.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("ix_conversations_merged_into_id", "conversations", ["merged_into_id"])

    # 2. Add original_conversation_id to messages if not present
    msg_cols = [c["name"] for c in insp.get_columns("messages")]
    if "original_conversation_id" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column(
                "original_conversation_id",
                sa.Integer(),
                sa.ForeignKey("conversations.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index("ix_messages_original_conversation_id", "messages", ["original_conversation_id"])

    # 3. Create conversation_links table if not present
    tables = insp.get_table_names()
    if "conversation_links" not in tables:
        op.create_table(
            "conversation_links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("conversation_id_1", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("conversation_id_2", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("conversation_id_1", "conversation_id_2", name="uq_conversation_links_pair"),
        )
        op.create_index("ix_conversation_links_c1", "conversation_links", ["conversation_id_1"])
        op.create_index("ix_conversation_links_c2", "conversation_links", ["conversation_id_2"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()
    if "conversation_links" in tables:
        op.drop_table("conversation_links")

    msg_cols = [c["name"] for c in insp.get_columns("messages")]
    if "original_conversation_id" in msg_cols:
        op.drop_index("ix_messages_original_conversation_id", table_name="messages")
        op.drop_column("messages", "original_conversation_id")

    conv_cols = [c["name"] for c in insp.get_columns("conversations")]
    if "merged_into_id" in conv_cols:
        op.drop_index("ix_conversations_merged_into_id", table_name="conversations")
        op.drop_column("conversations", "merged_into_id")

