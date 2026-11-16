"""add agent profiles

Revision ID: 1c555836ebbc
Revises: 403887097141
Create Date: 2026-11-10 17:40:08.800428

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c555836ebbc'
down_revision: Union[str, Sequence[str], None] = '403887097141'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'agent_profiles',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_available', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('max_conversations', sa.Integer(), server_default='5', nullable=False),
        sa.Column('active_conversations', sa.Integer(), server_default='0', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agent_profiles')