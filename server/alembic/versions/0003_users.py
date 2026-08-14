"""add users for Google sign-in

Revision ID: 0003_users
Revises: 0002_defer_overlap
Create Date: 2026-08-14
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0003_users"
down_revision: Union[str, Sequence[str], None] = "0002_defer_overlap"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL UNIQUE,
          google_sub VARCHAR(64) UNIQUE,
          name VARCHAR(256),
          picture_url VARCHAR(1024),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS users;")
