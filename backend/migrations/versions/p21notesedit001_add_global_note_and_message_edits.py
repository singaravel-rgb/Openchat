"""add global note and message edits

Revision ID: p21notesedit001
Revises: p20roles001
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p21notesedit001"
down_revision: Union[str, None] = "p20roles001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add global note columns to conversations table
    conv_cols = [c["name"] for c in insp.get_columns("conversations")]
    if "global_note" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column("global_note", sa.Text(), nullable=True),
        )
    if "global_note_updated_at" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column("global_note_updated_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "global_note_updated_by_id" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column(
                "global_note_updated_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # 2. Add message edit/retract tracking columns to messages table
    msg_cols = [c["name"] for c in insp.get_columns("messages")]
    if "edited_at" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "edited_by_id" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column(
                "edited_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "edit_history" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column("edit_history", sa.JSON(), nullable=False, server_default="[]"),
        )
    if "is_retracted" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column("is_retracted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    if "retracted_at" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column("retracted_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "retracted_by_id" not in msg_cols:
        op.add_column(
            "messages",
            sa.Column(
                "retracted_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    msg_cols = [c["name"] for c in insp.get_columns("messages")]
    if "retracted_by_id" in msg_cols:
        op.drop_column("messages", "retracted_by_id")
    if "retracted_at" in msg_cols:
        op.drop_column("messages", "retracted_at")
    if "is_retracted" in msg_cols:
        op.drop_column("messages", "is_retracted")
    if "edit_history" in msg_cols:
        op.drop_column("messages", "edit_history")
    if "edited_by_id" in msg_cols:
        op.drop_column("messages", "edited_by_id")
    if "edited_at" in msg_cols:
        op.drop_column("messages", "edited_at")

    conv_cols = [c["name"] for c in insp.get_columns("conversations")]
    if "global_note_updated_by_id" in conv_cols:
        op.drop_column("conversations", "global_note_updated_by_id")
    if "global_note_updated_at" in conv_cols:
        op.drop_column("conversations", "global_note_updated_at")
    if "global_note" in conv_cols:
        op.drop_column("conversations", "global_note")
