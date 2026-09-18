"""create tracker receipts storage bucket

Revision ID: c8a7d7d93b27
Revises: 035a1d523d57
Create Date: 2026-08-12 14:25:34.114043
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8a7d7d93b27'
down_revision: str | Sequence[str] | None = '035a1d523d57'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('MoneyTracker', 'MoneyTracker', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
        ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
          allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
    """)
    op.execute("""
        CREATE POLICY tracker_receipts_member_read ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'MoneyTracker' AND EXISTS (
          SELECT 1 FROM public.tracker_members WHERE tracker_members.tracker_id::text = (storage.foldername(name))[1]
          AND tracker_members.user_id = auth.uid() AND tracker_members.status = 'active'))
    """)
    op.execute("""
        CREATE POLICY tracker_receipts_member_upload ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'MoneyTracker' AND owner_id = auth.uid()::text AND EXISTS (
          SELECT 1 FROM public.tracker_members WHERE tracker_members.tracker_id::text = (storage.foldername(name))[1]
          AND tracker_members.user_id = auth.uid() AND tracker_members.status = 'active'))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tracker_receipts_member_upload ON storage.objects")
    op.execute("DROP POLICY IF EXISTS tracker_receipts_member_read ON storage.objects")
