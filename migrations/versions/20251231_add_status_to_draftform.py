"""Add status column to DraftForm

Revision ID: 20251231_add_status_to_draftform
Revises:
Create Date: 2025-12-31 00:00:00.000000

This migration adds a `status` column (VARCHAR(20)) to the `draft_form` table
and sets its default to 'draft'. The downgrade removes the column.

Note: Adjust the table name if your DraftForm __tablename__ differs.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251231_add_status_to_draftform'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add the 'status' column with default 'draft'
    op.add_column('draft_form', sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'))
    # If your DB doesn't accept server_default on add_column, you may need to
    # run an UPDATE afterwards and alter the column. The above works for
    # PostgreSQL/MySQL/SQLite (recent versions).


def downgrade():
    # Remove the status column
    op.drop_column('draft_form', 'status')
