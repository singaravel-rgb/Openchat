"""add super admin roles and user invitations

Revision ID: p20roles001
Revises: p19mergelink001
Create Date: 2026-11-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p20roles001"
down_revision: Union[str, None] = "p19mergelink001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add audit tracking columns to users
    user_cols = [c["name"] for c in insp.get_columns("users")]
    if "created_by_id" not in user_cols:
        op.add_column(
            "users",
            sa.Column(
                "created_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "last_role_changed_by_id" not in user_cols:
        op.add_column(
            "users",
            sa.Column(
                "last_role_changed_by_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "role_changed_at" not in user_cols:
        op.add_column(
            "users",
            sa.Column(
                "role_changed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    # 2. Create user_invitations table
    tables = insp.get_table_names()
    if "user_invitations" not in tables:
        op.create_table(
            "user_invitations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=False),
            sa.Column("token", sa.String(length=255), nullable=False),
            sa.Column("invited_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="pending"),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_user_invitations_email", "user_invitations", ["email"])
        op.create_index("ix_user_invitations_token", "user_invitations", ["token"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "user_invitations" in tables:
        op.drop_table("user_invitations")

    user_cols = [c["name"] for c in insp.get_columns("users")]
    if "role_changed_at" in user_cols:
        op.drop_column("users", "role_changed_at")
    if "last_role_changed_by_id" in user_cols:
        op.drop_column("users", "last_role_changed_by_id")
    if "created_by_id" in user_cols:
        op.drop_column("users", "created_by_id")

