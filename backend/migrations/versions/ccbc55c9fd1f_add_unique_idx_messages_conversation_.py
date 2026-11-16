"""add_unique_idx_messages_conversation_client_id

Revision ID: ccbc55c9fd1f
Revises: e2fcf23fe399
Create Date: 2026-11-16 08:16:18.624371

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ccbc55c9fd1f'
down_revision: Union[str, Sequence[str], None] = 'e2fcf23fe399'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add unique composite index for idempotency on customer messages
    # Using DO block to handle IF NOT EXISTS for partial indexes in PostgreSQL
    op.execute(
        "DO $$\n"
        "BEGIN\n"
        "    IF NOT EXISTS (\n"
        "        SELECT 1 FROM pg_indexes WHERE indexname = 'uq_messages_conversation_client_id'\n"
        "    ) THEN\n"
        "        CREATE UNIQUE INDEX uq_messages_conversation_client_id\n"
        "        ON messages (conversation_id, client_message_id)\n"
        "        WHERE client_message_id IS NOT NULL;\n"
        "    END IF;\n"
        "END $$;"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute('DROP INDEX IF EXISTS uq_messages_conversation_client_id')
