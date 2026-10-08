"""add reward perks and redemptions tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-08 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create reward_perks table
    op.create_table(
        'reward_perks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('points_cost', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='perk'),
        sa.Column('icon', sa.String(length=10), nullable=False, server_default='🎁'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    # 2. Create reward_redemptions table
    op.create_table(
        'reward_redemptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('perk_id', sa.Integer(), sa.ForeignKey('reward_perks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('points_spent', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='approved'),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.Column('admin_notes', sa.String(length=500), nullable=True),
        sa.Column('reviewed_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_reward_redemptions_user_id', 'reward_redemptions', ['user_id'])
    op.create_index('ix_reward_redemptions_perk_id', 'reward_redemptions', ['perk_id'])
    op.create_index('ix_reward_redemptions_status', 'reward_redemptions', ['status'])
    op.create_index('ix_reward_redemptions_created_at', 'reward_redemptions', ['created_at'])


def downgrade() -> None:
    op.drop_table('reward_redemptions')
    op.drop_table('reward_perks')
