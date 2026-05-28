"""add SONG_SEARCH feature flag

Revision ID: 003
Revises: 002
Create Date: 2026-05-28
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

_UPGRADE_SQL = """
INSERT INTO feature_flags (key, enabled, description)
VALUES ('SONG_SEARCH', false, 'Search queue by song name and artist instead of URL')
ON CONFLICT (key) DO NOTHING;
"""

_DOWNGRADE_SQL = """
DELETE FROM feature_flags WHERE key = 'SONG_SEARCH';
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
