"""Add logo_url to system settings

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-09 11:13:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('system_settings', sa.Column('logo_url', sa.String(length=255), nullable=True))

def downgrade() -> None:
    op.drop_column('system_settings', 'logo_url')
