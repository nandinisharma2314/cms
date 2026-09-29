from sqlalchemy import (
    Boolean, Column, Computed, Date, DateTime, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base
from utils.security import utcnow


def max_length(attribute) -> int:
    """The declared size of a String column, e.g. max_length(EndUser.name): the
    single source of text limits, for validation and for the apps' forms."""
    return attribute.property.columns[0].type.length

# ---------------------------------------------------------------------------
# System settings (managed by the Super Admin; see services/settings_service.py)
# ---------------------------------------------------------------------------


class SystemSettings(Base):
    """A single row (id = 1) of business settings. A NULL value means "not
    configured yet": features that need it refuse to work and the admin panel
    lists it under configuration problems."""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    organisation_name = Column(String(150), nullable=True)
    product_name = Column(String(100), nullable=True)
    support_email = Column(String(120), nullable=True)
    support_phone = Column(String(40), nullable=True)
    support_hours = Column(String(120), nullable=True)
    timezone = Column(String(64), nullable=True)  # IANA name, e.g. "Asia/Kolkata"
    complaint_id_prefix = Column(String(10), nullable=True)
    # Number the next complaint gets (complaint IDs are "<prefix>-<number>"); incremented on use.
    complaint_next_number = Column(Integer, nullable=True)
    reopen_window_days = Column(Integer, nullable=True)
    max_reopens = Column(Integer, nullable=True)
    max_attachments_per_complaint = Column(Integer, nullable=True)
    max_attachment_mb = Column(Integer, nullable=True)
    allowed_attachment_types = Column(String(255), nullable=True)  # comma-separated extensions
    phone_country_code = Column(String(6), nullable=True)  # e.g. "+91"
    phone_number_length = Column(Integer, nullable=True)  # digits after the country code
    # Optional: leading digits a mobile number normally starts with; imports warn about others.
    phone_expected_prefixes = Column(String(20), nullable=True)
    sms_notifications_enabled = Column(Boolean, nullable=False)
    email_notifications_enabled = Column(Boolean, nullable=False)
    updated_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


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


class UserPermission(Base):
    """Explicit permission override for an individual user.
    is_granted=True grants a permission not in their role.
    is_granted=False revokes a permission granted by their role."""
    __tablename__ = "user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "permission_id", name="uq_user_permission"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    is_granted = Column(Boolean, default=True, nullable=False)

    permission = relationship("Permission", lazy="joined")
    user = relationship("User", back_populates="custom_permissions")


# ---------------------------------------------------------------------------
# Priorities, departments, categories, locations
# ---------------------------------------------------------------------------

class Priority(Base):
    """A complaint priority. Every priority has a default SLA rule (created
    with it), so an active priority always has response/resolution targets."""
    __tablename__ = "priorities"

    id = Column(Integer, primary_key=True)
    key = Column(String(30), unique=True, nullable=False)
    name = Column(String(50), unique=True, nullable=False)
    # 1 = most urgent; drives sort order in lists and filters.
    rank = Column(Integer, unique=True, nullable=False)
    tone = Column(String(20), nullable=False)  # badge colour: see PRIORITY_TONES
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)


PRIORITY_TONES = ("neutral", "info", "success", "warning", "danger", "critical")


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
    # Priority a complaint in this category starts with; staff can change it later.
    default_priority_id = Column(Integer, ForeignKey("priorities.id"), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    department = relationship("Department", back_populates="categories")
    default_priority = relationship("Priority", lazy="joined")


class LocationType(Base):
    """A level of the location hierarchy (e.g. region, site, zone). Levels are
    defined by the admins; depth 0 is the top."""
    __tablename__ = "location_types"

    id = Column(Integer, primary_key=True)
    key = Column(String(30), unique=True, nullable=False)
    name = Column(String(50), nullable=False)
    depth = Column(Integer, unique=True, nullable=False)


class Location(Base):
    """A node in the location tree. `path` is the materialized path of ids from
    the root down to this node ("/1/4/9/"), so "is X inside Y" is a prefix check."""
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("parent_scope", "name", name="uq_locations_parent_scope_name"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    type_id = Column(Integer, ForeignKey("location_types.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("locations.id"), nullable=True, index=True)
    # parent_id with NULL (top level) mapped to 0, so names are unique at every level.
    parent_scope = Column(Integer, Computed("coalesce(parent_id, 0)", persisted=True))
    path = Column(String(255), nullable=False, index=True)
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
    mobile = Column(String(20), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    # Set for passwords someone else chose (new accounts, approved resets).
    must_change_password = Column(Boolean, default=False, nullable=False)
    # Bumped to invalidate every token issued so far (password change, deactivation).
    token_version = Column(Integer, default=0, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    reports_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    primary_department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    primary_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # Off (e.g. on leave) = skipped by automatic complaint routing.
    is_available = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    role = relationship("Role", lazy="joined")
    reports_to = relationship("User", remote_side=[id], foreign_keys=[reports_to_id])
    primary_department = relationship("Department", foreign_keys=[primary_department_id], lazy="joined")
    primary_location = relationship("Location", foreign_keys=[primary_location_id], lazy="joined")
    scopes = relationship("UserScope", back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    custom_permissions = relationship("UserPermission", back_populates="user", cascade="all, delete-orphan", lazy="selectin")

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
# End users (people who raise complaints; imported via CSV or added by staff)
# ---------------------------------------------------------------------------

GENDERS = ("female", "male", "other", "prefer_not_to_say")


class EndUser(Base):
    __tablename__ = "end_users"
    __table_args__ = (UniqueConstraint("mobile", "email"),)

    id = Column(Integer, primary_key=True)
    external_id = Column(String(50), unique=True, nullable=True)  # user_id column from the CSV
    name = Column(String(150), nullable=False)
    mobile = Column(String(20), nullable=False, index=True)  # normalized national number
    email = Column(String(120), nullable=False, index=True)  # lowercased
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    token_version = Column(Integer, default=0, nullable=False)

    # Profile details the end user maintains in the portal
    dob = Column(Date, nullable=True)
    gender = Column(String(20), nullable=True)  # one of GENDERS
    address = Column(String(500), nullable=True)
    # Whether complaint updates are also sent by SMS / email (when the organisation enables those channels).
    notify_sms = Column(Boolean, default=True, nullable=False)
    notify_email = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    location = relationship("Location", lazy="joined")


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

class RefreshToken(Base):
    """Refresh tokens rotate on every use. All tokens descending from one login
    share a family; presenting an already-rotated token (outside the short
    grace window) revokes the whole family."""
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_principal", "principal_type", "principal_id"),)

    id = Column(Integer, primary_key=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    family_id = Column(String(64), nullable=False, index=True)
    principal_type = Column(String(20), nullable=False)  # "staff" | "end_user"
    principal_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    replaced_at = Column(DateTime, nullable=True)  # set when rotated (as opposed to logged out)
    created_at = Column(DateTime, default=utcnow, nullable=False)


OTP_PURPOSE_LOGIN = "login"
OTP_PURPOSE_CONTACT = "contact_change"


class OtpChallenge(Base):
    """A one-time code sent to a mobile number or email address.

    Login challenges are keyed by the identifier, not by an account: the same
    response is given whether or not the identifier is registered (unknown
    identifiers get a decoy challenge that is never sent and never verifies)."""
    __tablename__ = "otp_challenges"
    __table_args__ = (Index("ix_otp_challenges_target", "purpose", "channel", "target"),)

    id = Column(Integer, primary_key=True)
    challenge_id = Column(String(64), unique=True, nullable=False)
    purpose = Column(String(20), nullable=False)  # OTP_PURPOSE_*
    channel = Column(String(10), nullable=False)  # "sms" | "email"
    target = Column(String(120), nullable=False)  # normalized mobile or email
    end_user_id = Column(Integer, ForeignKey("end_users.id", ondelete="CASCADE"), nullable=True)  # contact changes
    is_decoy = Column(Boolean, default=False, nullable=False)
    code_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


RESET_PENDING, RESET_APPROVED, RESET_REJECTED = "PENDING", "APPROVED", "REJECTED"


class PasswordResetTicket(Base):
    """A locked-out staff user's request for a new password, decided by
    someone above them. The account is matched when the ticket is raised."""
    __tablename__ = "password_reset_tickets"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(String(20), unique=True, index=True, nullable=False)
    identifier = Column(String(120), nullable=False)  # what the requester typed (email or mobile)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL: no account matched
    reason = Column(String(500), nullable=False)
    status = Column(String(20), nullable=False, index=True)  # RESET_*
    created_at = Column(DateTime, default=utcnow, nullable=False)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_note = Column(String(500), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    decided_by = relationship("User", foreign_keys=[decided_by_id])


class RateLimitCounter(Base):
    """Fixed-window counters shared by every API worker."""
    __tablename__ = "rate_limit_counters"
    __table_args__ = (UniqueConstraint("bucket", "subject", "window_start", name="uq_rate_limit_window"),)

    id = Column(Integer, primary_key=True)
    bucket = Column(String(50), nullable=False)
    subject = Column(String(190), nullable=False)
    window_start = Column(DateTime, nullable=False, index=True)
    count = Column(Integer, nullable=False)


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
    # Required for new complaints (it sets the starting priority); NULL only on complaints
    # registered before categories became mandatory.
    category_id = Column(Integer, ForeignKey("complaint_categories.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=False, index=True)
    priority_id = Column(Integer, ForeignKey("priorities.id"), nullable=False, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    additional_details = Column(String(500), nullable=True)

    # Contact details for complaints registered by staff for someone without a portal account.
    end_user_name = Column(String(150), nullable=True)
    end_user_phone = Column(String(20), nullable=True)

    # Workflow state; see services/workflow_service.py for the allowed transitions.
    status = Column(String(30), nullable=False, index=True)
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
    sla_paused_at = Column(DateTime, nullable=True)  # set while waiting for the end user

    # Active escalation, if any; history lives in complaint_escalations.
    escalation_level = Column(Integer, default=0, nullable=False)
    escalation_type = Column(String(20), nullable=True)  # "response" | "resolution"
    escalated_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    escalation_due_at = Column(DateTime, nullable=True, index=True)

    feedback_rating = Column(Integer, nullable=True)  # 1-5, given by the end user
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
    priority = relationship("Priority", lazy="joined")
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
    """A file stored under UPLOAD_DIR. Never served statically: downloads go
    through a signed, expiring link checked against the viewer's access."""
    __tablename__ = "complaint_attachments"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    comment_id = Column(Integer, ForeignKey("complaint_comments.id", ondelete="CASCADE"), nullable=True)
    storage_name = Column(String(100), unique=True, nullable=False)  # file name inside UPLOAD_DIR
    content_type = Column(String(100), nullable=False)
    file_name = Column(String(200), nullable=False)  # original name, for display and download
    file_size = Column(Integer, nullable=True)  # bytes; NULL only for files uploaded before sizes were recorded
    # "staff" | "end_user"; NULL only for files uploaded before uploaders were recorded.
    uploaded_by_type = Column(String(20), nullable=True)
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
    """One entry of a complaint's timeline. `public_message` is what the end user
    sees; events without it are staff-only."""
    __tablename__ = "complaint_history"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
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
    __table_args__ = (UniqueConstraint("priority_id", "department_scope", name="uq_sla_rules_priority_scope"),)

    id = Column(Integer, primary_key=True)
    priority_id = Column(Integer, ForeignKey("priorities.id", ondelete="CASCADE"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    # department_id with NULL (the default) mapped to 0, so there is one default per priority. VIRTUAL
    # because MySQL rejects a STORED column over a base column whose foreign key cascades.
    department_scope = Column(Integer, Computed("coalesce(department_id, 0)", persisted=False))
    response_hours = Column(Integer, nullable=False)
    resolution_hours = Column(Integer, nullable=False)
    warning_minutes = Column(Integer, nullable=False)  # "due soon" lead time

    priority = relationship("Priority", lazy="joined")
    department = relationship("Department")


class EscalationRule(Base):
    """How a breached SLA climbs the hierarchy: each escalated level gets
    `level_hours` to act before it moves one level further, up to `max_level`.
    A department row overrides the default (department_id NULL); a disabled
    department row turns escalation off for that department."""
    __tablename__ = "escalation_rules"
    __table_args__ = (UniqueConstraint("breach_type", "department_scope", name="uq_escalation_rules_type_scope"),)

    id = Column(Integer, primary_key=True)
    breach_type = Column(String(20), nullable=False)  # "response" | "resolution"
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    department_scope = Column(Integer, Computed("coalesce(department_id, 0)", persisted=False))  # see SlaRule
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
    """In-app notification for a staff user or an end user."""
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
    deliveries = relationship("MessageDelivery", back_populates="notification", cascade="all, delete-orphan")


DELIVERY_PENDING, DELIVERY_SENT, DELIVERY_FAILED = "pending", "sent", "failed"


class MessageDelivery(Base):
    """An SMS or email copy of a notification, sent by the background worker."""
    __tablename__ = "message_deliveries"
    __table_args__ = (Index("ix_message_deliveries_due", "status", "next_attempt_at"),)

    id = Column(Integer, primary_key=True)
    notification_id = Column(Integer, ForeignKey("notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(10), nullable=False)  # "sms" | "email"
    target = Column(String(120), nullable=False)
    status = Column(String(10), nullable=False)  # DELIVERY_*
    attempts = Column(Integer, default=0, nullable=False)
    next_attempt_at = Column(DateTime, nullable=False)
    last_error = Column(String(500), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    notification = relationship("Notification", back_populates="deliveries")


# ---------------------------------------------------------------------------
# Governance: rejections, imports, audit
# ---------------------------------------------------------------------------

class RejectionReason(Base):
    """A reason category offered when rejecting a complaint (managed by admins)."""
    __tablename__ = "rejection_reasons"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    sort_order = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class RejectionRequest(Base):
    """An agent's request to reject a complaint, decided by someone above them.
    Direct rejections by approvers are stored too (direct=True), so every
    rejection has the same audit record."""
    __tablename__ = "rejection_requests"

    id = Column(Integer, primary_key=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # who it was routed to
    reason_id = Column(Integer, ForeignKey("rejection_reasons.id"), nullable=False)
    reason = Column(Text, nullable=False)
    previous_status = Column(String(30), nullable=False)  # restored when denied or withdrawn
    status = Column(String(20), nullable=False, index=True)  # PENDING/APPROVED/DENIED/WITHDRAWN
    direct = Column(Boolean, default=False, nullable=False)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    decision_note = Column(Text, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    complaint = relationship("Complaint", back_populates="rejection_requests")
    reason_category = relationship("RejectionReason", lazy="joined")
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
    """A failed row (severity "error", not imported) or a warning (imported).
    `data` keeps the original row for the failed-row report until the
    retention period (IMPORT_ISSUE_RETENTION_DAYS) clears it."""
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
    __table_args__ = (Index("ix_audit_logs_entity", "entity_type", "entity_id"),)

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


# ---------------------------------------------------------------------------
# Staff Grievances / Whistleblower System
# ---------------------------------------------------------------------------

GRIEVANCE_STATUS_SUBMITTED = "submitted"
GRIEVANCE_STATUS_UNDER_REVIEW = "under_review"
GRIEVANCE_STATUS_INVESTIGATING = "investigating"
GRIEVANCE_STATUS_ACTION_TAKEN = "action_taken"
GRIEVANCE_STATUS_RESOLVED = "resolved"
GRIEVANCE_STATUS_DISMISSED = "dismissed"

GRIEVANCE_STATUSES = (
    GRIEVANCE_STATUS_SUBMITTED,
    GRIEVANCE_STATUS_UNDER_REVIEW,
    GRIEVANCE_STATUS_INVESTIGATING,
    GRIEVANCE_STATUS_ACTION_TAKEN,
    GRIEVANCE_STATUS_RESOLVED,
    GRIEVANCE_STATUS_DISMISSED,
)

GRIEVANCE_CATEGORIES = (
    "harassment",
    "bullying",
    "discrimination",
    "corruption_bribery",
    "retaliation",
    "policy_violation",
    "workplace_safety",
    "abuse_of_authority",
    "other",
)

GRIEVANCE_TARGET_TYPES = (
    "colleague",
    "superior",
    "management",
    "department",
    "other",
)

GRIEVANCE_SEVERITIES = ("low", "medium", "high", "critical")


class StaffGrievance(Base):
    """Internal grievance/whistleblower complaint filed by a staff member.
    Enforces strict anti-conflict isolation: accused colleagues/superiors
    are blocked from accessing or investigating grievances naming them."""
    __tablename__ = "staff_grievances"

    id = Column(Integer, primary_key=True, index=True)
    tracking_id = Column(String(50), unique=True, index=True, nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_anonymous = Column(Boolean, default=False, nullable=False)
    accused_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_type = Column(String(30), nullable=False)
    category = Column(String(50), nullable=False)
    severity = Column(String(20), default="medium", nullable=False)
    subject = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    incident_date = Column(Date, nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    status = Column(String(30), default=GRIEVANCE_STATUS_SUBMITTED, nullable=False, index=True)
    assigned_investigator_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    resolution_summary = Column(Text, nullable=True)
    resolution_action = Column(String(100), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    reporter = relationship("User", foreign_keys=[reporter_id])
    accused_user = relationship("User", foreign_keys=[accused_user_id])
    assigned_investigator = relationship("User", foreign_keys=[assigned_investigator_id])
    department = relationship("Department", lazy="joined")
    location = relationship("Location", lazy="joined")
    attachments = relationship(
        "StaffGrievanceAttachment", back_populates="grievance", cascade="all, delete-orphan",
        order_by="StaffGrievanceAttachment.id",
    )
    events = relationship(
        "StaffGrievanceEvent", back_populates="grievance", cascade="all, delete-orphan",
        order_by="StaffGrievanceEvent.id",
    )


class StaffGrievanceAttachment(Base):
    __tablename__ = "staff_grievance_attachments"

    id = Column(Integer, primary_key=True, index=True)
    grievance_id = Column(Integer, ForeignKey("staff_grievances.id", ondelete="CASCADE"), nullable=False, index=True)
    storage_name = Column(String(100), unique=True, nullable=False)
    content_type = Column(String(100), nullable=False)
    file_name = Column(String(200), nullable=False)
    file_size = Column(Integer, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    grievance = relationship("StaffGrievance", back_populates="attachments")
    uploaded_by = relationship("User")


class StaffGrievanceEvent(Base):
    __tablename__ = "staff_grievance_events"

    id = Column(Integer, primary_key=True)
    grievance_id = Column(Integer, ForeignKey("staff_grievances.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(150), nullable=True)
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)
    message = Column(String(500), nullable=False)
    is_confidential_note = Column(Boolean, default=False, nullable=False)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    grievance = relationship("StaffGrievance", back_populates="events")
    actor = relationship("User")
