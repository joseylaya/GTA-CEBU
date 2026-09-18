"""enable tracker message realtime

Revision ID: 4d79cc4fe6cb
Revises: 46d7251d26d4
Create Date: 2026-08-12 12:30:49.888494
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d79cc4fe6cb'
down_revision: str | Sequence[str] | None = '46d7251d26d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE public.tracker_messages ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tracker_messages_active_member_read
        ON public.tracker_messages FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.tracker_members
            WHERE tracker_members.tracker_id = tracker_messages.tracker_id
              AND tracker_members.user_id = auth.uid()
              AND tracker_members.status = 'active'
          )
        )
        """
    )
    op.execute("ALTER PUBLICATION supabase_realtime ADD TABLE public.tracker_messages")


def downgrade() -> None:
    op.execute("ALTER PUBLICATION supabase_realtime DROP TABLE public.tracker_messages")
    op.execute("DROP POLICY IF EXISTS tracker_messages_active_member_read ON public.tracker_messages")
    op.execute("ALTER TABLE public.tracker_messages DISABLE ROW LEVEL SECURITY")
