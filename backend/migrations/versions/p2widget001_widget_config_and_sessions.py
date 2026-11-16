"""phase2_widget_config_and_sessions

Revision ID: p2widget001
Revises: p1conveng001
Create Date: 2026-11-11 18:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'p2widget001'
down_revision: Union[str, Sequence[str], None] = 'p1conveng001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'widget_configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('widget_title', sa.String(length=100), nullable=False, server_default='OpenChat Support'),
        sa.Column('brand_name', sa.String(length=100), nullable=False, server_default='OpenChat'),
        sa.Column('logo_url', sa.String(length=500), nullable=True),
        sa.Column('primary_color', sa.String(length=20), nullable=False, server_default='#2563eb'),
        sa.Column('launcher_position', sa.String(length=20), nullable=False, server_default='bottom-right'),
        sa.Column('welcome_message', sa.String(length=500), nullable=False, server_default='Hi! How can we help you today?'),
        sa.Column('greeting_text', sa.String(length=500), nullable=False, server_default='Start a conversation with our team.'),
        sa.Column('widget_visibility', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('allowed_domains', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('widget_availability', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('hide_launcher_on_help_page', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('show_agent_avatar', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('require_email', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_table(
        'widget_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_token_hash', sa.String(length=255), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_guest', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('origin', sa.String(length=255), nullable=True),
        sa.Column('guest_name', sa.String(length=255), nullable=True),
        sa.Column('guest_email', sa.String(length=255), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_token_hash')
    )
    op.create_index('ix_widget_sessions_user_id', 'widget_sessions', ['user_id'], unique=False)
    op.create_index('ix_widget_sessions_expires_at', 'widget_sessions', ['expires_at'], unique=False)
    op.create_index('ix_widget_sessions_token_hash', 'widget_sessions', ['session_token_hash'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_widget_sessions_token_hash', table_name='widget_sessions')
    op.drop_index('ix_widget_sessions_expires_at', table_name='widget_sessions')
    op.drop_index('ix_widget_sessions_user_id', table_name='widget_sessions')
    op.drop_table('widget_sessions')
    op.drop_table('widget_configs')
