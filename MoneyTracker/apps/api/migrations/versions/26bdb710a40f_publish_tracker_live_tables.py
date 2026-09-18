"""publish tracker live tables

Revision ID: 26bdb710a40f
Revises: c8a7d7d93b27
Create Date: 2026-08-12 15:08:28.464855
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26bdb710a40f'
down_revision: str | Sequence[str] | None = 'c8a7d7d93b27'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses")
    op.execute("ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements")
    op.execute("ALTER PUBLICATION supabase_realtime ADD TABLE public.tracker_members")
    op.execute("ALTER PUBLICATION supabase_realtime ADD TABLE public.tracker_message_reactions")


def downgrade() -> None:
    op.execute("ALTER PUBLICATION supabase_realtime DROP TABLE public.tracker_message_reactions")
    op.execute("ALTER PUBLICATION supabase_realtime DROP TABLE public.tracker_members")
    op.execute("ALTER PUBLICATION supabase_realtime DROP TABLE public.settlements")
    op.execute("ALTER PUBLICATION supabase_realtime DROP TABLE public.expenses")
