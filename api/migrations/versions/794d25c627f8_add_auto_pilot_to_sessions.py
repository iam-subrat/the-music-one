"""add_auto_pilot_to_sessions

Revision ID: 794d25c627f8
Revises: 008
Create Date: 2026-10-04 22:13:55.536185

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '794d25c627f8'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_UPGRADE_SQL = """
ALTER TABLE sessions ADD COLUMN auto_pilot BOOLEAN NOT NULL DEFAULT FALSE;
"""

_DOWNGRADE_SQL = """
ALTER TABLE sessions DROP COLUMN auto_pilot;
"""


def upgrade() -> None:
    op.execute(_UPGRADE_SQL)


def downgrade() -> None:
    op.execute(_DOWNGRADE_SQL)
