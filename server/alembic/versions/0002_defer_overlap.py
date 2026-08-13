"""defer allocation overlap exclusion until commit

Revision ID: 0002_defer_overlap
Revises: 0001_initial
Create Date: 2026-08-13
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002_defer_overlap"
down_revision: Union[str, Sequence[str], None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE allocations DROP CONSTRAINT allocations_no_overlap;
        ALTER TABLE allocations ADD CONSTRAINT allocations_no_overlap
          EXCLUDE USING gist (
            event_id WITH =,
            room_id WITH =,
            tstzrange(start_at, end_at) WITH &&
          ) DEFERRABLE INITIALLY DEFERRED;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE allocations DROP CONSTRAINT allocations_no_overlap;
        ALTER TABLE allocations ADD CONSTRAINT allocations_no_overlap
          EXCLUDE USING gist (
            event_id WITH =,
            room_id WITH =,
            tstzrange(start_at, end_at) WITH &&
          );
        """
    )
