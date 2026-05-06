"""baseline

Revision ID: 001
Revises:
Create Date: 2026-05-06
"""
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass  # Schema already applied via Supabase dashboard


def downgrade() -> None:
    pass
