"""add tier_config to reward_settings

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-08 17:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reward_settings', sa.Column('tier_config', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reward_settings', 'tier_config')
