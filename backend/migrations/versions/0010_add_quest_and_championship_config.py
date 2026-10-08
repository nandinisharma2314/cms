"""add quest_config and championship_config to reward_settings

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-08 17:55:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reward_settings', sa.Column('quest_config', sa.Text(), nullable=True))
    op.add_column('reward_settings', sa.Column('championship_config', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reward_settings', 'championship_config')
    op.drop_column('reward_settings', 'quest_config')
