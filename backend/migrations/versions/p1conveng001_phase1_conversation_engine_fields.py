"""phase1_conversation_engine_fields

Revision ID: p1conveng001
Revises: c2adb77fed13
Create Date: 2026-11-11 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'p1conveng001'
down_revision: Union[str, Sequence[str], None] = 'c2adb77fed13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversations', sa.Column('priority', sa.String(length=20), nullable=False, server_default='normal'))
    op.add_column('conversations', sa.Column('tags', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('conversations', sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversations', sa.Column('assignment_history', sa.JSON(), nullable=False, server_default='[]'))
    op.add_column('conversations', sa.Column('customer_last_read_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversations', sa.Column('agent_last_read_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversations', sa.Column('resolution_details', sa.Text(), nullable=True))
    op.create_index('ix_conversations_priority', 'conversations', ['priority'], unique=False)
    op.create_index('ix_conversations_assigned_status', 'conversations', ['assigned_agent_id', 'status'], unique=False)

    op.add_column('messages', sa.Column('delivery_status', sa.String(length=20), nullable=False, server_default='delivered'))
    op.add_column('messages', sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('messages', sa.Column('client_message_id', sa.String(length=100), nullable=True))
    op.create_index('ix_messages_client_message_id', 'messages', ['client_message_id'], unique=False)
    op.create_index('ix_messages_conversation_created', 'messages', ['conversation_id', 'created_at'], unique=False)
    # unique per conversation when client_message_id provided
    op.create_index('uq_messages_conversation_client_id', 'messages', ['conversation_id', 'client_message_id'], unique=True, postgresql_where=sa.text('client_message_id IS NOT NULL'))


def downgrade() -> None:
    op.drop_index('uq_messages_conversation_client_id', table_name='messages')
    op.drop_index('ix_messages_conversation_created', table_name='messages')
    op.drop_index('ix_messages_client_message_id', table_name='messages')
    op.drop_column('messages', 'client_message_id')
    op.drop_column('messages', 'processed_at')
    op.drop_column('messages', 'delivery_status')

    op.drop_index('ix_conversations_assigned_status', table_name='conversations')
    op.drop_index('ix_conversations_priority', table_name='conversations')
    op.drop_column('conversations', 'resolution_details')
    op.drop_column('conversations', 'agent_last_read_at')
    op.drop_column('conversations', 'customer_last_read_at')
    op.drop_column('conversations', 'assignment_history')
    op.drop_column('conversations', 'closed_at')
    op.drop_column('conversations', 'tags')
    op.drop_column('conversations', 'priority')
