"""Add join_date and end_date to users and end_users

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-10 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. users table
    op.add_column('users', sa.Column('join_date', sa.Date(), server_default=sa.func.current_date(), nullable=False))
    op.add_column('users', sa.Column('end_date', sa.Date(), nullable=True))
    op.execute(sa.text("UPDATE users SET join_date = DATE(created_at) WHERE created_at IS NOT NULL"))

    # 2. end_users table
    op.add_column('end_users', sa.Column('join_date', sa.Date(), server_default=sa.func.current_date(), nullable=False))
    op.add_column('end_users', sa.Column('end_date', sa.Date(), nullable=True))
    op.execute(sa.text("UPDATE end_users SET join_date = DATE(created_at) WHERE created_at IS NOT NULL"))

def downgrade() -> None:
    op.drop_column('end_users', 'end_date')
    op.drop_column('end_users', 'join_date')
    op.drop_column('users', 'end_date')
    op.drop_column('users', 'join_date')
