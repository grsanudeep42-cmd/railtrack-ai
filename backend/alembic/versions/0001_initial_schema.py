"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-03-14

Creates all core RailTrack AI tables:
  users, trains, schedules, conflicts, decisions, audit_log, simulation_results
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision = '0001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id',              sa.String(),   primary_key=True),
        sa.Column('email',           sa.String(),   nullable=False),
        sa.Column('hashed_password', sa.String(),   nullable=True),
        sa.Column('name',            sa.String(),   nullable=False),
        sa.Column('role',            sa.Enum('CONTROLLER', 'SUPERVISOR', 'LOGISTICS', 'ADMIN', name='roleenum'), nullable=False),
        sa.Column('section',         sa.String(),   nullable=False, server_default='NR-42'),
        sa.Column('is_active',       sa.Boolean(),  nullable=False, server_default='true'),
        sa.Column('google_id',       sa.String(),   nullable=True),
        sa.Column('created_at',      sa.DateTime(), nullable=True),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_id',    'users', ['id'])

    # ── trains ─────────────────────────────────────────────────────────────────
    op.create_table(
        'trains',
        sa.Column('id',          sa.String(),  primary_key=True),
        sa.Column('name',        sa.String(),  nullable=False),
        sa.Column('priority',    sa.Enum('EXPRESS', 'FREIGHT', 'LOCAL', 'MAINTENANCE', name='priorityenum'), nullable=False),
        sa.Column('origin',      sa.String(),  nullable=False),
        sa.Column('destination', sa.String(),  nullable=False),
        sa.Column('section',     sa.String(),  nullable=False, server_default='NR-42'),
        sa.Column('status',      sa.Enum('ON_TIME', 'DELAYED', 'RUNNING', 'HALTED', 'CONFLICT', 'SCHEDULED', 'CANCELLED', name='trainstatusenum'), nullable=False, server_default='SCHEDULED'),
        sa.Column('delay',       sa.Integer(), nullable=True,  server_default='0'),
        sa.Column('speed',       sa.Float(),   nullable=True,  server_default='0.0'),
        sa.Column('platform',    sa.Integer(), nullable=True),
        sa.Column('created_at',  sa.DateTime(), nullable=True),
    )
    op.create_index('ix_trains_id', 'trains', ['id'])

    # ── schedules ──────────────────────────────────────────────────────────────
    op.create_table(
        'schedules',
        sa.Column('id',             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('train_id',       sa.String(),  sa.ForeignKey('trains.id', ondelete='CASCADE'), nullable=False),
        sa.Column('station',        sa.String(),  nullable=False),
        sa.Column('station_code',   sa.String(),  nullable=False),
        sa.Column('sequence',       sa.Integer(), nullable=False),
        sa.Column('arrival_time',   sa.DateTime(), nullable=True),
        sa.Column('departure_time', sa.DateTime(), nullable=True),
        sa.Column('platform',       sa.Integer(), nullable=True),
        sa.Column('distance_km',    sa.Float(),   nullable=True),
    )

    # ── conflicts ──────────────────────────────────────────────────────────────
    op.create_table(
        'conflicts',
        sa.Column('id',               sa.String(),  primary_key=True),
        sa.Column('train_a_id',       sa.String(),  sa.ForeignKey('trains.id'), nullable=False),
        sa.Column('train_b_id',       sa.String(),  sa.ForeignKey('trains.id'), nullable=False),
        sa.Column('location',         sa.String(),  nullable=False),
        sa.Column('severity',         sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='severityenum'), nullable=False, server_default='MEDIUM'),
        sa.Column('conflict_type',    sa.Enum('CROSSING', 'PLATFORM', 'HEADWAY', 'LOOP', name='conflicttypeenum'), nullable=False, server_default='CROSSING'),
        sa.Column('time_to_conflict', sa.Integer(), nullable=True),
        sa.Column('recommendation',   sa.Text(),    nullable=True),
        sa.Column('confidence',       sa.Integer(), nullable=True, server_default='85'),
        sa.Column('time_saving',      sa.Integer(), nullable=True, server_default='0'),
        sa.Column('detected_at',      sa.DateTime(), nullable=True),
        sa.Column('resolved',         sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('resolved_at',      sa.DateTime(), nullable=True),
    )
    op.create_index('ix_conflicts_id', 'conflicts', ['id'])

    # ── decisions ──────────────────────────────────────────────────────────────
    op.create_table(
        'decisions',
        sa.Column('id',          sa.String(),  primary_key=True),
        sa.Column('conflict_id', sa.String(),  sa.ForeignKey('conflicts.id'), nullable=True),
        sa.Column('action',      sa.String(),  nullable=False),
        sa.Column('operator_id', sa.String(),  sa.ForeignKey('users.id'), nullable=True),
        sa.Column('source',      sa.Enum('AI', 'MANUAL', name='decisionsourceenum'), nullable=False, server_default='AI'),
        sa.Column('notes',       sa.Text(),    nullable=True),
        sa.Column('timestamp',   sa.DateTime(), nullable=True),
    )
    op.create_index('ix_decisions_id', 'decisions', ['id'])

    # ── audit_log ──────────────────────────────────────────────────────────────
    op.create_table(
        'audit_log',
        sa.Column('id',        sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id',   sa.String(),  nullable=True),
        sa.Column('action',    sa.String(),  nullable=False),
        sa.Column('entity',    sa.String(),  nullable=True),
        sa.Column('detail',    sa.Text(),    nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
    )

    # ── simulation_results ─────────────────────────────────────────────────────
    op.create_table(
        'simulation_results',
        sa.Column('id',                sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('event_type',        sa.String(),  nullable=False),
        sa.Column('location',          sa.String(),  nullable=False),
        sa.Column('duration_min',      sa.Integer(), nullable=False),
        sa.Column('objective',         sa.String(),  nullable=False),
        sa.Column('baseline_delay',    sa.Integer(), nullable=True),
        sa.Column('optimized_delay',   sa.Integer(), nullable=True),
        sa.Column('delay_delta',       sa.Integer(), nullable=True),
        sa.Column('conflicts_avoided', sa.Integer(), nullable=True),
        sa.Column('result_json',       sa.Text(),    nullable=True),
        sa.Column('run_by',            sa.String(),  nullable=True),
        sa.Column('created_at',        sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('simulation_results')
    op.drop_table('audit_log')
    op.drop_table('decisions')
    op.drop_table('conflicts')
    op.drop_table('schedules')
    op.drop_table('trains')
    op.drop_table('users')
    # Drop custom enums
    for enum_name in ['roleenum', 'priorityenum', 'trainstatusenum',
                      'severityenum', 'conflicttypeenum', 'decisionsourceenum']:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
