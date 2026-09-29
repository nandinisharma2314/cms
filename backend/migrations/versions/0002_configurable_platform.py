"""Configurable platform: settings, priorities, rejection reasons, security tables.

Converts an existing database without losing data:
  * complaints.priority / sla_rules.priority strings -> priorities table + FKs
  * rejection_requests.category strings -> rejection_reasons + FK
  * attachment paths "/uploads/<name>" -> storage names (files stay where they are)
  * reset tickets -> matched user, PENDING/APPROVED status
  * end_users.dob strings -> dates; gender -> fixed keys

Installations that already hold data keep behaving as before: the values the
old code had built in (the four priorities, the six rejection reasons, the
complaint ID prefix, attachment limits and phone format) are written into the
new tables and the settings row, where admins can now change them. A fresh,
empty database gets none of them.

Revision ID: 0002
Revises: 0001
"""
import mimetypes
import re
from datetime import date

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# What revision 0001's code had hardcoded; used only to convert existing data.
LEGACY_PRIORITIES = [("critical", "Critical", 1, "critical"), ("high", "High", 2, "danger"),
                     ("medium", "Medium", 3, "warning"), ("low", "Low", 4, "success")]
LEGACY_DEFAULT_PRIORITY = "Medium"
LEGACY_REJECTION_REASONS = [
    "Outside department jurisdiction", "Outside municipal jurisdiction", "Duplicate complaint",
    "Insufficient or false information", "Private property matter", "Other",
]
LEGACY_SETTINGS = {
    "complaint_id_prefix": "CMP",
    "reopen_window_days": 7,
    "max_reopens": 3,
    "max_attachments_per_complaint": 5,
    "max_attachment_mb": 10,
    "allowed_attachment_types": "jpg,jpeg,png,webp,gif,pdf,mp4,mov,csv,doc,docx",
    "phone_country_code": "+91",
    "phone_number_length": 10,
    "phone_expected_prefixes": "6789",
}


def _conn():
    return op.get_bind()


def _scalar(sql: str, **params):
    return _conn().execute(sa.text(sql), params).scalar()


def _rows(sql: str, **params):
    return _conn().execute(sa.text(sql), params).fetchall()


def _exec(sql: str, **params):
    _conn().execute(sa.text(sql), params)


def _index_names(table: str, unique_only: bool = False) -> list[str]:
    sql = ("SELECT DISTINCT index_name FROM information_schema.statistics "
           "WHERE table_schema = DATABASE() AND table_name = :t AND index_name <> 'PRIMARY'")
    if unique_only:
        sql += " AND non_unique = 0"
    return [r[0] for r in _rows(sql, t=table)]


def _index_columns(table: str, index: str) -> list[str]:
    return [r[0] for r in _rows(
        "SELECT column_name FROM information_schema.statistics WHERE table_schema = DATABASE() "
        "AND table_name = :t AND index_name = :i ORDER BY seq_in_index", t=table, i=index)]


def _drop_unique_on(table: str, columns: list[str]) -> None:
    for name in _index_names(table, unique_only=True):
        if _index_columns(table, name) == columns:
            op.drop_index(name, table_name=table)


def _fk_names(table: str, column: str) -> list[str]:
    return [r[0] for r in _rows(
        "SELECT constraint_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() "
        "AND table_name = :t AND column_name = :c AND referenced_table_name IS NOT NULL", t=table, c=column)]


def _has_legacy_data() -> bool:
    return bool(_scalar("SELECT COUNT(*) FROM complaints") or _scalar("SELECT COUNT(*) FROM sla_rules")
                or _scalar("SELECT COUNT(*) FROM complaint_categories"))


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "priority"


def upgrade() -> None:
    legacy = _has_legacy_data()

    # --- system settings ------------------------------------------------------
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organisation_name", sa.String(150), nullable=True),
        sa.Column("product_name", sa.String(100), nullable=True),
        sa.Column("support_email", sa.String(120), nullable=True),
        sa.Column("support_phone", sa.String(40), nullable=True),
        sa.Column("support_hours", sa.String(120), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=True),
        sa.Column("complaint_id_prefix", sa.String(10), nullable=True),
        sa.Column("complaint_next_number", sa.Integer(), nullable=True),
        sa.Column("reopen_window_days", sa.Integer(), nullable=True),
        sa.Column("max_reopens", sa.Integer(), nullable=True),
        sa.Column("max_attachments_per_complaint", sa.Integer(), nullable=True),
        sa.Column("max_attachment_mb", sa.Integer(), nullable=True),
        sa.Column("allowed_attachment_types", sa.String(255), nullable=True),
        sa.Column("phone_country_code", sa.String(6), nullable=True),
        sa.Column("phone_number_length", sa.Integer(), nullable=True),
        sa.Column("phone_expected_prefixes", sa.String(20), nullable=True),
        sa.Column("sms_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("email_notifications_enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    if legacy:
        columns = ", ".join(LEGACY_SETTINGS)
        values = ", ".join(f":{k}" for k in LEGACY_SETTINGS)
        _exec(f"INSERT INTO system_settings (id, {columns}, sms_notifications_enabled, email_notifications_enabled) "
              f"VALUES (1, {values}, 0, 0)", **LEGACY_SETTINGS)
        # Continue after the highest existing number (the old IDs were "CMP-<10000 + id>").
        _exec("UPDATE system_settings SET complaint_next_number = "
              "(SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(generated_id, '-', -1) AS UNSIGNED)), 0) + 1 FROM complaints) "
              "WHERE id = 1")

    # --- priorities -----------------------------------------------------------
    op.create_table(
        "priorities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(30), nullable=False, unique=True),
        sa.Column("name", sa.String(50), nullable=False, unique=True),
        sa.Column("rank", sa.Integer(), nullable=False, unique=True),
        sa.Column("tone", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    if legacy:
        used = {r[0] for r in _rows("SELECT DISTINCT priority FROM complaints")} | \
               {r[0] for r in _rows("SELECT DISTINCT priority FROM sla_rules")}
        known = {name for _, name, _, _ in LEGACY_PRIORITIES}
        rank = len(LEGACY_PRIORITIES)
        entries = list(LEGACY_PRIORITIES)
        for extra in sorted(used - known):
            rank += 1
            entries.append((_slug(extra), extra, rank, "neutral"))
        for key, name, position, tone in entries:
            _exec("INSERT INTO priorities (`key`, name, `rank`, tone, is_active, created_at) "
                  "VALUES (:k, :n, :r, :t, 1, UTC_TIMESTAMP())", k=key, n=name, r=position, t=tone)

    # categories: default priority
    op.add_column("complaint_categories", sa.Column("default_priority_id", sa.Integer(), nullable=True))
    if legacy:
        _exec("UPDATE complaint_categories SET default_priority_id = "
              "(SELECT id FROM priorities WHERE name = :n)", n=LEGACY_DEFAULT_PRIORITY)
    op.alter_column("complaint_categories", "default_priority_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_categories_default_priority", "complaint_categories", "priorities",
                          ["default_priority_id"], ["id"])

    # complaints: priority -> priority_id
    op.add_column("complaints", sa.Column("priority_id", sa.Integer(), nullable=True))
    _exec("UPDATE complaints c JOIN priorities p ON p.name = c.priority SET c.priority_id = p.id")
    op.alter_column("complaints", "priority_id", existing_type=sa.Integer(), nullable=False)
    op.create_index("ix_complaints_priority_id", "complaints", ["priority_id"])
    op.create_foreign_key("fk_complaints_priority", "complaints", "priorities", ["priority_id"], ["id"])
    op.drop_column("complaints", "priority")

    # sla_rules: priority -> priority_id, one rule per (priority, department or default)
    op.add_column("sla_rules", sa.Column("priority_id", sa.Integer(), nullable=True))
    _exec("UPDATE sla_rules s JOIN priorities p ON p.name = s.priority SET s.priority_id = p.id")
    _drop_unique_on("sla_rules", ["priority", "department_id"])
    op.drop_column("sla_rules", "priority")
    op.alter_column("sla_rules", "priority_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_sla_rules_priority", "sla_rules", "priorities", ["priority_id"], ["id"],
                          ondelete="CASCADE")
    # VIRTUAL: MySQL rejects a STORED generated column over a base column whose foreign key cascades.
    op.add_column("sla_rules", sa.Column("department_scope", sa.Integer(),
                                         sa.Computed("coalesce(department_id, 0)", persisted=False)))
    _exec("DELETE s1 FROM sla_rules s1 JOIN sla_rules s2 ON s1.priority_id = s2.priority_id "
          "AND s1.department_scope = s2.department_scope AND s1.id > s2.id")
    op.create_unique_constraint("uq_sla_rules_priority_scope", "sla_rules", ["priority_id", "department_scope"])

    # escalation_rules: one rule per (breach type, department or default)
    _drop_unique_on("escalation_rules", ["breach_type", "department_id"])
    op.add_column("escalation_rules", sa.Column("department_scope", sa.Integer(),
                                                sa.Computed("coalesce(department_id, 0)", persisted=False)))
    _exec("DELETE e1 FROM escalation_rules e1 JOIN escalation_rules e2 ON e1.breach_type = e2.breach_type "
          "AND e1.department_scope = e2.department_scope AND e1.id > e2.id")
    op.create_unique_constraint("uq_escalation_rules_type_scope", "escalation_rules",
                                ["breach_type", "department_scope"])

    # locations: names unique at every level, including the top
    op.create_index("ix_locations_parent_id", "locations", ["parent_id"])
    _drop_unique_on("locations", ["parent_id", "name"])
    op.add_column("locations", sa.Column("parent_scope", sa.Integer(),
                                         sa.Computed("coalesce(parent_id, 0)", persisted=True)))
    duplicates = _rows("SELECT name FROM locations GROUP BY parent_scope, name HAVING COUNT(*) > 1")
    if duplicates:
        raise RuntimeError("Duplicate location names at the same level must be merged first: "
                           + ", ".join(r[0] for r in duplicates))
    op.create_unique_constraint("uq_locations_parent_scope_name", "locations", ["parent_scope", "name"])

    # --- rejection reasons ----------------------------------------------------
    op.create_table(
        "rejection_reasons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
    )
    if legacy:
        names = list(LEGACY_REJECTION_REASONS)
        for (category,) in _rows("SELECT DISTINCT category FROM rejection_requests"):
            if category not in names:
                names.append(category)
        for position, name in enumerate(names, start=1):
            _exec("INSERT INTO rejection_reasons (name, sort_order, is_active) VALUES (:n, :o, 1)", n=name, o=position)
    op.add_column("rejection_requests", sa.Column("reason_id", sa.Integer(), nullable=True))
    _exec("UPDATE rejection_requests r JOIN rejection_reasons x ON x.name = r.category SET r.reason_id = x.id")
    op.alter_column("rejection_requests", "reason_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key("fk_rejection_requests_reason", "rejection_requests", "rejection_reasons",
                          ["reason_id"], ["id"])
    op.drop_column("rejection_requests", "category")

    # --- staff users ----------------------------------------------------------
    missing_passwords = _scalar("SELECT COUNT(*) FROM users WHERE password_hash IS NULL OR password_hash = ''")
    if missing_passwords:
        raise RuntimeError(f"{missing_passwords} staff account(s) have no password; set one before migrating")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    _exec("UPDATE users SET mobile = NULL WHERE mobile = ''")
    shared = _rows("SELECT mobile FROM users WHERE mobile IS NOT NULL GROUP BY mobile HAVING COUNT(*) > 1")
    if shared:
        raise RuntimeError("Staff mobile numbers must be unique; shared by several accounts: "
                           + ", ".join(r[0] for r in shared))
    if "ix_users_mobile" in _index_names("users"):
        op.drop_index("ix_users_mobile", table_name="users")
    op.create_unique_constraint("uq_users_mobile", "users", ["mobile"])
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))

    # --- end users -------------------------------------------------------------
    op.add_column("end_users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("end_users", sa.Column("dob_date", sa.Date(), nullable=True))
    for end_user_id, raw in _rows("SELECT id, dob FROM end_users WHERE dob IS NOT NULL AND dob <> ''"):
        try:
            parsed = date.fromisoformat(raw.strip())
        except ValueError:
            continue  # not a date; the end user can enter it again
        _exec("UPDATE end_users SET dob_date = :d WHERE id = :i", d=parsed, i=end_user_id)
    op.drop_column("end_users", "dob")
    op.alter_column("end_users", "dob_date", new_column_name="dob", existing_type=sa.Date(), existing_nullable=True)
    _exec("UPDATE end_users SET gender = LOWER(gender) WHERE LOWER(gender) IN ('male', 'female', 'other')")
    _exec("UPDATE end_users SET gender = NULL WHERE gender IS NOT NULL AND gender NOT IN ('male', 'female', 'other')")
    op.drop_column("end_users", "language")
    op.drop_column("end_users", "notify_alerts")

    # --- refresh tokens: families ---------------------------------------------------
    op.add_column("refresh_tokens", sa.Column("family_id", sa.String(64), nullable=True))
    op.add_column("refresh_tokens", sa.Column("replaced_at", sa.DateTime(), nullable=True))
    _exec("UPDATE refresh_tokens SET family_id = token_hash")
    op.alter_column("refresh_tokens", "family_id", existing_type=sa.String(64), nullable=False)
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    # --- OTP challenges: keyed by identifier (open challenges are short-lived; recreate) ---
    op.drop_table("otp_challenges")
    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("challenge_id", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("target", sa.String(120), nullable=False),
        sa.Column("end_user_id", sa.Integer(), sa.ForeignKey("end_users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("is_decoy", sa.Boolean(), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False, index=True),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_otp_challenges_target", "otp_challenges", ["purpose", "channel", "target"])

    # --- password reset tickets ---------------------------------------------------
    op.add_column("password_reset_tickets", sa.Column("identifier", sa.String(120), nullable=True))
    op.add_column("password_reset_tickets", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("password_reset_tickets", sa.Column("decided_by_id", sa.Integer(), nullable=True))
    op.add_column("password_reset_tickets", sa.Column("decided_at", sa.DateTime(), nullable=True))
    op.add_column("password_reset_tickets", sa.Column("decision_note", sa.String(500), nullable=True))
    _exec("UPDATE password_reset_tickets SET identifier = email_or_id, decided_by_id = approved_by_id")
    _exec("UPDATE password_reset_tickets t JOIN users u ON u.email = LOWER(TRIM(t.email_or_id)) SET t.user_id = u.id")
    _exec("UPDATE password_reset_tickets SET status = CASE status WHEN 'Approved' THEN 'APPROVED' ELSE 'PENDING' END")
    _exec("UPDATE password_reset_tickets SET created_at = UTC_TIMESTAMP() WHERE created_at IS NULL")
    for fk in _fk_names("password_reset_tickets", "approved_by_id"):
        op.drop_constraint(fk, "password_reset_tickets", type_="foreignkey")
    op.drop_column("password_reset_tickets", "approved_by_id")
    op.drop_column("password_reset_tickets", "email_or_id")
    op.drop_column("password_reset_tickets", "department")
    op.alter_column("password_reset_tickets", "identifier", existing_type=sa.String(120), nullable=False)
    op.alter_column("password_reset_tickets", "status", existing_type=sa.String(50), type_=sa.String(20), nullable=False)
    op.alter_column("password_reset_tickets", "created_at", existing_type=sa.DateTime(), nullable=False)
    op.alter_column("password_reset_tickets", "ticket_id", existing_type=sa.String(50), type_=sa.String(20),
                    existing_nullable=False)
    op.create_foreign_key("fk_reset_tickets_user", "password_reset_tickets", "users", ["user_id"], ["id"])
    op.create_foreign_key("fk_reset_tickets_decided_by", "password_reset_tickets", "users", ["decided_by_id"], ["id"])
    op.create_index("ix_password_reset_tickets_status", "password_reset_tickets", ["status"])
    if "ix_password_reset_tickets_id" in _index_names("password_reset_tickets"):
        op.drop_index("ix_password_reset_tickets_id", table_name="password_reset_tickets")

    # --- rate limits and message deliveries ----------------------------------------
    op.create_table(
        "rate_limit_counters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bucket", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(190), nullable=False),
        sa.Column("window_start", sa.DateTime(), nullable=False, index=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("bucket", "subject", "window_start", name="uq_rate_limit_window"),
    )
    op.create_table(
        "message_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("notification_id", sa.Integer(), sa.ForeignKey("notifications.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("target", sa.String(120), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_message_deliveries_due", "message_deliveries", ["status", "next_attempt_at"])

    # --- attachments: private storage names ------------------------------------------
    op.alter_column("complaint_attachments", "file_path", new_column_name="storage_name",
                    existing_type=sa.String(500), type_=sa.String(100), existing_nullable=False)
    _exec("UPDATE complaint_attachments SET storage_name = SUBSTRING_INDEX(storage_name, '/', -1)")
    op.alter_column("complaint_attachments", "file_type", new_column_name="content_type",
                    existing_type=sa.String(100), existing_nullable=True)
    for attachment_id, storage_name, content_type, file_name in _rows(
        "SELECT id, storage_name, content_type, file_name FROM complaint_attachments"
    ):
        _exec("UPDATE complaint_attachments SET content_type = :c, file_name = :f WHERE id = :i",
              c=content_type or mimetypes.guess_type(storage_name)[0] or "application/octet-stream",
              f=file_name or storage_name, i=attachment_id)
    op.alter_column("complaint_attachments", "content_type", existing_type=sa.String(100), nullable=False)
    op.alter_column("complaint_attachments", "file_name", existing_type=sa.String(200), nullable=False)
    op.add_column("complaint_attachments", sa.Column("file_size", sa.Integer(), nullable=True))
    op.create_unique_constraint("uq_complaint_attachments_storage_name", "complaint_attachments", ["storage_name"])
    for column, target in (("complaint_id", "complaints"), ("comment_id", "complaint_comments")):
        for fk in _fk_names("complaint_attachments", column):
            op.drop_constraint(fk, "complaint_attachments", type_="foreignkey")
        op.create_foreign_key(f"fk_attachments_{column}", "complaint_attachments", target, [column], ["id"],
                              ondelete="CASCADE")
    op.create_index("ix_complaint_attachments_complaint_id", "complaint_attachments", ["complaint_id"])

    # --- indexes used by reports and the audit log ----------------------------------------
    op.create_index("ix_complaint_history_event_type", "complaint_history", ["event_type"])
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])


def downgrade() -> None:
    raise NotImplementedError("0002 converts data in place and cannot be reversed; restore a backup instead")
