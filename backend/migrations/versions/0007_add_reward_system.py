"""add reward system tables and user point columns

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08 14:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add reward points to users
    op.add_column('users', sa.Column('reward_points_balance', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('lifetime_reward_points', sa.Integer(), nullable=False, server_default='0'))

    # 2. Create reward_settings table
    op.create_table(
        'reward_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('currency_name', sa.String(length=50), nullable=False, server_default='Points'),
        sa.Column('currency_symbol', sa.String(length=10), nullable=False, server_default='🪙'),
        sa.Column('eligible_roles', sa.Text(), nullable=False),
        sa.Column('points_on_time_resolution', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('points_speed_bonus', sa.Integer(), nullable=False, server_default='25'),
        sa.Column('points_five_star', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('points_four_star', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('points_zero_reopen', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('streak_interval', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('streak_bonus', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('priority_multipliers', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('updated_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )

    # 3. Create reward_transactions table
    op.create_table(
        'reward_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('complaint_id', sa.Integer(), sa.ForeignKey('complaints.id', ondelete='SET NULL'), nullable=True),
        sa.Column('department_id', sa.Integer(), sa.ForeignKey('departments.id', ondelete='SET NULL'), nullable=True),
        sa.Column('location_id', sa.Integer(), sa.ForeignKey('locations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rule_type', sa.String(length=50), nullable=False),
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_reward_transactions_user_id', 'reward_transactions', ['user_id'])
    op.create_index('ix_reward_transactions_created_at', 'reward_transactions', ['created_at'])
    op.create_index('ix_reward_transactions_complaint_id', 'reward_transactions', ['complaint_id'])
    op.create_index('ix_reward_transactions_rule_type', 'reward_transactions', ['rule_type'])


def downgrade() -> None:
    op.drop_table('reward_transactions')
    op.drop_table('reward_settings')
    op.drop_column('users', 'lifetime_reward_points')
    op.drop_column('users', 'reward_points_balance')
