"""add source_url and resolve_status to queue_items

Revision ID: 002
Revises: 001
Create Date: 2026-05-16
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE queue_items ADD COLUMN IF NOT EXISTS resolve_status text NOT NULL DEFAULT 'resolved'
  CHECK (resolve_status IN ('resolving', 'resolved', 'failed'));
"""

_DOWNGRADE_SQL = """
ALTER TABLE queue_items DROP COLUMN IF EXISTS resolve_status;
ALTER TABLE queue_items DROP COLUMN IF EXISTS source_url;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
