"""add aadhar and pan to users

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-08 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column('users', sa.Column('aadhar', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('pan_card', sa.String(length=20), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'pan_card')
    op.drop_column('users', 'aadhar')
