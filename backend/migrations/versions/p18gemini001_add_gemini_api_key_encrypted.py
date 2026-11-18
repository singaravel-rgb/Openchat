"""add gemini_api_key_encrypted to ai_configs

Revision ID: p18gemini001
Revises: p17task001
Create Date: 2026-11-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p18gemini001"
down_revision: Union[str, None] = "p17task001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = [c["name"] for c in insp.get_columns("ai_configs")]
    if "gemini_api_key_encrypted" not in cols:
        op.add_column("ai_configs", sa.Column("gemini_api_key_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = [c["name"] for c in insp.get_columns("ai_configs")]
    if "gemini_api_key_encrypted" in cols:
        op.drop_column("ai_configs", "gemini_api_key_encrypted")

