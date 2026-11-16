"""phase3 ai config usage and message metadata

Revision ID: p3ai001
Revises: p2widget001
Create Date: 2026-11-11 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'p3ai001'
down_revision: Union[str, Sequence[str], None] = 'p2widget001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ai_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ai_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('provider', sa.String(length=30), nullable=False, server_default='demo'),
        sa.Column('model', sa.String(length=100), nullable=False, server_default='gpt-4o-mini'),
        sa.Column('openai_api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('anthropic_api_key_encrypted', sa.Text(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=False, server_default='0.3'),
        sa.Column('max_tokens', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('system_instructions', sa.Text(), nullable=True),
        sa.Column('greeting', sa.Text(), nullable=True),
        sa.Column('tone', sa.String(length=50), nullable=False, server_default='professional'),
        sa.Column('supported_languages', sa.JSON(), nullable=False, server_default='["en"]'),
        sa.Column('confidence_threshold', sa.Float(), nullable=False, server_default='0.55'),
        sa.Column('escalation_rules', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('max_response_length', sa.Integer(), nullable=False, server_default='1200'),
        sa.Column('knowledge_sources', sa.JSON(), nullable=False, server_default='{"faqs": true, "articles": true}'),
        sa.Column('last_test_status', sa.String(length=30), nullable=True),
        sa.Column('last_test_message', sa.Text(), nullable=True),
        sa.Column('last_tested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table(
        'ai_usage_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=True),
        sa.Column('message_id', sa.Integer(), nullable=True),
        sa.Column('provider', sa.String(length=30), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost_usd', sa.Float(), nullable=False, server_default='0'),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('decision', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['message_id'], ['messages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ai_usage_logs_conversation_id', 'ai_usage_logs', ['conversation_id'], unique=False)
    op.create_index('ix_ai_usage_logs_created_at', 'ai_usage_logs', ['created_at'], unique=False)
    op.add_column('messages', sa.Column('ai_metadata', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'ai_metadata')
    op.drop_index('ix_ai_usage_logs_created_at', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_conversation_id', table_name='ai_usage_logs')
    op.drop_table('ai_usage_logs')
    op.drop_table('ai_configs')
