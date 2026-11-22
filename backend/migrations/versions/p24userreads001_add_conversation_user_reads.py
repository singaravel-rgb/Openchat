"""add conversation_user_reads table

Revision ID: p24userreads001
Revises: p23pwdreset001
Create Date: 2026-11-23

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "p24userreads001"
down_revision: Union[str, None] = "p23pwdreset001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "conversation_user_reads" not in tables:
        op.create_table(
            "conversation_user_reads",
            sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
            sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("last_read_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("last_read_message_id", sa.Integer(), nullable=True),
            sa.UniqueConstraint("conversation_id", "user_id", name="uq_conv_user_reads"),
        )
        op.create_index("ix_conv_user_reads_user", "conversation_user_reads", ["user_id"])
        op.create_index("ix_conv_user_reads_conv_user", "conversation_user_reads", ["conversation_id", "user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()
    if "conversation_user_reads" in tables:
        op.drop_table("conversation_user_reads")
