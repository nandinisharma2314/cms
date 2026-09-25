from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Table, Text, UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship

from database import Base
from utils.security import utcnow


# ---------------------------------------------------------------------------
# Roles & permissions
# ---------------------------------------------------------------------------

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False)  # e.g. "complaint.view"
    group = Column(String(50), nullable=False)
    description = Column(String(255), nullable=False)


class Role(Base):
    """A role sits under a parent role. The chain of parents is the management
    hierarchy: a user can only create/manage users whose role is below theirs."""
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)  # stable identifier, e.g. "manager"
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    parent_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    parent = relationship("Role", remote_side=[id], backref="children")
    permissions = relationship("Permission", secondary=role_permissions, lazy="selectin")


# ---------------------------------------------------------------------------
# Departments & locations
# ---------------------------------------------------------------------------

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    categories = relationship(
        "ComplaintCategory", back_populates="department",
        cascade="all, delete-orphan", order_by="ComplaintCategory.name",
    )


class ComplaintCategory(Base):
    __tablename__ = "complaint_categories"
    __table_args__ = (UniqueConstraint("department_id", "name"),)

    id = Column(Integer, primary_key=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    department = relationship("Department", back_populates="categories")


class LocationType(Base):
    """A level of the location hierarchy (country, state, district, city, area)."""
    __tablename__ = "location_types"

    id = Column(Integer, primary_key=True)
    key = Column(String(30), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    depth = Column(Integer, unique=True, nullable=False)  # 0 = top level


class Location(Base):
    """A node in the location tree. `path` is the materialized path of ids from
    the root down to this node ("/1/4/9/"), so "is X inside Y" is a prefix check."""
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("parent_id", "name"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    type_id = Column(Integer, ForeignKey("location_types.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    path = Column(String(255), nullable=False, default="", index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    type = relationship("LocationType", lazy="joined")
    parent = relationship("Location", remote_side=[id], backref="children")


# ---------------------------------------------------------------------------
# Staff users (people who operate the platform)
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    mobile = Column(String(20), index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    reports_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # Off (e.g. on leave) = skipped by automatic complaint routing.
    is_available = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    role = relationship("Role", lazy="joined")
    reports_to = relationship("User", remote_side=[id], foreign_keys=[reports_to_id])
    scopes = relationship("UserScope", back_populates="user", cascade="all, delete-orphan", lazy="selectin")

    def __repr__(self):
        return f"<User {self.email}>"


class UserScope(Base):
    """One (department, location) pair a staff user covers. NULL means "all".
    A user's effective access is the union of their scopes."""
    __tablename__ = "user_scopes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)

    user = relationship("User", back_populates="scopes")
    department = relationship("Department", lazy="joined")
    location = relationship("Location", lazy="joined")


# ---------------------------------------------------------------------------
# End users (citizens who raise complaints; imported via CSV)
# ---------------------------------------------------------------------------

class EndUser(Base):
    __tablename__ = "end_users"
    __table_args__ = (UniqueConstraint("mobile", "email"),)

    id = Column(Integer, primary_key=True)
    external_id = Column(String(50), unique=True, nullable=True)  # user_id column from the CSV
    name = Column(String(150), nullable=False)
    mobile = Column(String(20), nullable=False, index=True)  # normalized digits
    email = Column(String(120), nullable=False, index=True)  # lowercased
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Profile details the citizen maintains in the portal
    dob = Column(String(20), nullable=True)
    gender = Column(String(20), nullable=True)
    address = Column(String(500), nullable=True)
    language = Column(String(50), default="English (India)", nullable=False)
    notify_sms = Column(Boolean, default=True, nullable=False)
    notify_email = Column(Boolean, default=True, nullable=False)
    notify_alerts = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    location = relationship("Location", lazy="joined")


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_principal", "principal_type", "principal_id"),)

    id = Column(Integer, primary_key=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    principal_type = Column(String(20), nullable=False)  # "staff" | "end_user"
    principal_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id = Column(Integer, primary_key=True)
    challenge_id = Column(String(64), unique=True, nullable=False)
    end_user_id = Column(Integer, ForeignKey("end_users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(10), nullable=False)  # "sms" | "email"
    code_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    end_user = relationship("EndUser")


class PasswordResetTicket(Base):
    __tablename__ = "password_reset_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(String(50), unique=True, index=True, nullable=False)
    email_or_id = Column(String(120), nullable=False)
    department = Column(String(100), nullable=False)
    reason = Column(String(500), nullable=False)
    status = Column(String(50), default="Pending Approval")  # Pending Approval, Approved
    created_at = Column(DateTime, default=utcnow)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


# ---------------------------------------------------------------------------
# Complaints
# ---------------------------------------------------------------------------

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    generated_id = Column(String(50), unique=True, index=True, nullable=False)
    end_user_id = Column(Integer, ForeignKey("end_users.id"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # staff who logged it

    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("complaint_categories.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)

    priority = Column(String(20), nullable=False, default="Medium")
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    additional_details = Column(String(500), nullable=True)

    citizen_name = Column(String(150), nullable=True)
    citizen_phone = Column(String(20), nullable=True)

    # Workflow state; see services/workflow_service.py for the allowed transitions.
    status = Column(String(30), default="SUBMITTED", nullable=False, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assigned_at = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)  # first staff response (response SLA)
    resolved_at = Column(DateTime, nullable=True)  # resolution SLA
    closed_at = Column(DateTime, nullable=True)  # closed or rejected
    resolution_note = Column(Text, nullable=True)
    reopen_count = Column(Integer, default=0, nullable=False)

    # SLA clocks (services/sla_service.py). *_warn_at is when the "due soon"
    # warning starts; *_warned_at / *_breached_at record when it actually fired.
    response_due_at = Column(DateTime, nullable=True, index=True)
    response_warn_at = Column(DateTime, nullable=True)
    response_warned_at = Column(DateTime, nullable=True)
    response_breached_at = Column(DateTime, nullable=True)
    resolution_due_at = Column(DateTime, nullable=True, index=True)
    resolution_warn_at = Column(DateTime, nullable=True)
    resolution_warned_at = Column(DateTime, nullable=True)
    resolution_breached_at = Column(DateTime, nullable=True)
    sla_paused_at = Column(DateTime, nullable=True)  # set while waiting for the citizen

    # Active escalation, if any; history lives in complaint_escalations.
    escalation_level = Column(Integer, default=0, nullable=False)
    escalation_type = Column(String(20), nullable=True)  # "response" | "resolution"
    escalated_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    escalation_due_at = Column(DateTime, nullable=True, index=True)

    feedback_rating = Column(Integer, nullable=True)  # 1-5, given by the citizen
    feedback_comment = Column(String(1000), nullable=True)
    feedback_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    end_user = relationship("EndUser")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    escalated_to = relationship("User", foreign_keys=[escalated_to_id])
    department = relationship("Department", lazy="joined")
    category = relationship("ComplaintCategory", lazy="joined")
    location = relationship("Location", lazy="joined")
    attachments = relationship(
        "ComplaintAttachment", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintAttachment.id",
    )
    comments = relationship(
        "ComplaintComment", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintComment.id",
    )
    events = relationship(
        "ComplaintEvent", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintEvent.id",
    )
    assignments = relationship(
        "ComplaintAssignment", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintAssignment.id",
    )
    escalations = relationship(
        "ComplaintEscalation", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintEscalation.id",
    )
    rejection_requests = relationship(
        "RejectionRequest", back_populates="complaint", cascade="all, delete-orphan",
        order_by="RejectionRequest.id",
    )

    def __repr__(self):
        return f"<Complaint {self.generated_id}>"


class ComplaintAttachment(Base):
    __tablename__ = "complaint_attachments"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id"), nullable=False)
    comment_id = Column(Integer, ForeignKey("complaint_comments.id"), nullable=True)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(100))
    file_name = Column(String(200))
    uploaded_by_type = Column(String(20), nullable=True)  # "staff" | "end_user"
    uploaded_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="attachments")
    comment = relationship("ComplaintComment", back_populates="attachments")


class ComplaintComment(Base):
    """A message on a complaint. Internal notes are only visible to staff."""
    __tablename__ = "complaint_comments"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    author_type = Column(String(20), nullable=False)  # "staff" | "end_user"
    author_id = Column(Integer, nullable=False)
    author_name = Column(String(150), nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="comments")
    attachments = relationship("ComplaintAttachment", back_populates="comment")


class ComplaintEvent(Base):
    """One entry of a complaint's timeline. `public_message` is what the citizen
    sees; events without it are staff-only."""
    __tablename__ = "complaint_history"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False)
    actor_type = Column(String(20), nullable=False)  # "staff" | "end_user" | "system"
    actor_id = Column(Integer, nullable=True)
    actor_name = Column(String(150), nullable=True)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)
    message = Column(String(500), nullable=False)
    public_message = Column(String(500), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    complaint = relationship("Complaint", back_populates="events")


class ComplaintAssignment(Base):
    """Assignment history. The open row (ended_at NULL) mirrors complaints.assigned_to_id."""
    __tablename__ = "complaint_assignments"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    method = Column(String(20), nullable=False)  # "auto" | "manual"
    reason = Column(String(255), nullable=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = routing engine
    assigned_at = Column(DateTime, default=utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)

    complaint = relationship("Complaint", back_populates="assignments")
    assignee = relationship("User", foreign_keys=[assignee_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


# ---------------------------------------------------------------------------
# SLA, escalation, notifications
# ---------------------------------------------------------------------------

class SlaRule(Base):
    """Response/resolution targets for a priority. department_id NULL = the
    default for every department; a department row overrides it."""
    __tablename__ = "sla_rules"
    __table_args__ = (UniqueConstraint("priority", "department_id"),)

    id = Column(Integer, primary_key=True)
    priority = Column(String(20), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    response_hours = Column(Integer, nullable=False)
    resolution_hours = Column(Integer, nullable=False)
    warning_minutes = Column(Integer, nullable=False, default=120)  # "due soon" lead time

    department = relationship("Department")


class EscalationRule(Base):
    """How a breached SLA climbs the hierarchy: each escalated level gets
    `level_hours` to act before it moves one level further, up to `max_level`."""
    __tablename__ = "escalation_rules"
    __table_args__ = (UniqueConstraint("breach_type", "department_id"),)

    id = Column(Integer, primary_key=True)
    breach_type = Column(String(20), nullable=False)  # "response" | "resolution"
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    level_hours = Column(Integer, nullable=False)
    max_level = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    department = relationship("Department")


class ComplaintEscalation(Base):
    __tablename__ = "complaint_escalations"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    breach_type = Column(String(20), nullable=False)
    level = Column(Integer, nullable=False)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)  # the breach was dealt with

    complaint = relationship("Complaint", back_populates="escalations")
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class Notification(Base):
    """In-app notification for a staff user or a citizen."""
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_recipient", "recipient_type", "recipient_id", "read_at"),)

    id = Column(Integer, primary_key=True)
    recipient_type = Column(String(20), nullable=False)  # "staff" | "end_user"
    recipient_id = Column(Integer, nullable=False)
    kind = Column(String(50), nullable=False)  # e.g. "complaint.assigned", "sla.breached"
    title = Column(String(200), nullable=False)
    body = Column(String(1000), nullable=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)

    complaint = relationship("Complaint")


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

class RejectionRequest(Base):
    """An agent's request to reject a complaint, decided by someone above them.
    Direct rejections by approvers are stored too (direct=True), so every
    rejection has the same audit record."""
    __tablename__ = "rejection_requests"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # who it was routed to
    category = Column(String(80), nullable=False)
    reason = Column(Text, nullable=False)
    previous_status = Column(String(30), nullable=False)  # restored when denied or withdrawn
    status = Column(String(20), default="PENDING", nullable=False, index=True)  # PENDING/APPROVED/DENIED/WITHDRAWN
    direct = Column(Boolean, default=False, nullable=False)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    decision_note = Column(Text, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="rejection_requests")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    approver = relationship("User", foreign_keys=[approver_id])
    decided_by = relationship("User", foreign_keys=[decided_by_id])


class ImportBatch(Base):
    """One CSV upload (a real import or a validate-only dry run)."""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True)
    kind = Column(String(20), nullable=False, index=True)  # "locations" | "end_users"
    filename = Column(String(255), nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    dry_run = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), nullable=False)  # "completed" | "validated" | "rejected"
    error = Column(String(500), nullable=True)  # why the whole file was rejected
    total_rows = Column(Integer, default=0, nullable=False)
    created = Column(Integer, default=0, nullable=False)
    updated = Column(Integer, default=0, nullable=False)
    unchanged = Column(Integer, default=0, nullable=False)
    failed = Column(Integer, default=0, nullable=False)
    warnings = Column(Integer, default=0, nullable=False)
    headers = Column(Text, nullable=True)  # JSON list, to rebuild failed-row reports
    started_at = Column(DateTime, default=utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)

    uploaded_by = relationship("User")
    issues = relationship("ImportIssue", back_populates="batch", cascade="all, delete-orphan",
                          order_by="ImportIssue.row_number")


class ImportIssue(Base):
    """A failed row (severity "error", not imported) or a warning (imported)."""
    __tablename__ = "import_issues"

    id = Column(Integer, primary_key=True)
    batch_id = Column(Integer, ForeignKey("import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    row_number = Column(Integer, nullable=False)
    severity = Column(String(10), nullable=False)  # "error" | "warning"
    message = Column(String(500), nullable=False)
    data = Column(Text, nullable=True)  # JSON of the original row

    batch = relationship("ImportBatch", back_populates="issues")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    actor_type = Column(String(20), nullable=False)  # "staff" | "end_user" | "system"
    actor_id = Column(Integer, nullable=True)
    actor_name = Column(String(150), nullable=True)
    action = Column(String(100), nullable=False, index=True)  # e.g. "user.create"
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=True)
    summary = Column(String(500), nullable=False)
    changes = Column(Text, nullable=True)  # JSON: {"field": [old, new]}
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
