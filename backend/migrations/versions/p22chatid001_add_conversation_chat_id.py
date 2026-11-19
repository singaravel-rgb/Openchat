"""add conversation chat_id

Revision ID: p22chatid001
Revises: p21notesedit001
Create Date: 2026-11-19

"""
from typing import Sequence, Union
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p22chatid001"
down_revision: Union[str, None] = "p21notesedit001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect_name = bind.dialect.name

    conv_cols = [c["name"] for c in insp.get_columns("conversations")]

    # 1. Create postgresql sequence for atomic sequential chat_id generation
    if dialect_name == "postgresql":
        bind.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS conversation_chat_id_seq;"))

    # 2. Add column chat_id as nullable initially
    if "chat_id" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column("chat_id", sa.String(50), nullable=True),
        )

    # 3. Backfill chat_id for existing conversations
    current_year = datetime.now(timezone.utc).year
    if dialect_name == "postgresql":
        # Backfill using year from created_at or current_year
        bind.execute(
            sa.text(
                f"""
                UPDATE conversations
                SET chat_id = 'OC-' || COALESCE(to_char(created_at, 'YYYY'), '{current_year}') || '-' || LPAD(id::text, 6, '0')
                WHERE chat_id IS NULL;
                """
            )
        )
        # Set sequence starting value to MAX(id) + 1
        bind.execute(
            sa.text(
                """
                SELECT setval(
                    'conversation_chat_id_seq',
                    COALESCE((SELECT MAX(id) FROM conversations), 0) + 1,
                    false
                );
                """
            )
        )
    else:
        # SQLite fallback
        bind.execute(
            sa.text(
                f"""
                UPDATE conversations
                SET chat_id = 'OC-{current_year}-' || printf('%06d', id)
                WHERE chat_id IS NULL;
                """
            )
        )

    # 4. Make chat_id NOT NULL and add unique index
    existing_indexes = [idx["name"] for idx in insp.get_indexes("conversations")]
    if "ix_conversations_chat_id" not in existing_indexes:
        op.create_index(
            "ix_conversations_chat_id",
            "conversations",
            ["chat_id"],
            unique=True,
        )

    if dialect_name != "sqlite":
        op.alter_column("conversations", "chat_id", nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect_name = bind.dialect.name

    existing_indexes = [idx["name"] for idx in insp.get_indexes("conversations")]
    if "ix_conversations_chat_id" in existing_indexes:
        op.drop_index("ix_conversations_chat_id", table_name="conversations")

    conv_cols = [c["name"] for c in insp.get_columns("conversations")]
    if "chat_id" in conv_cols:
        op.drop_column("conversations", "chat_id")

    if dialect_name == "postgresql":
        bind.execute(sa.text("DROP SEQUENCE IF EXISTS conversation_chat_id_seq;"))
