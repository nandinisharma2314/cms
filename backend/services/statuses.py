"""Complaint workflow statuses. Kept separate so the workflow, routing and SLA
services can all import them without importing each other."""

SUBMITTED = "SUBMITTED"
ASSIGNED = "ASSIGNED"
ACKNOWLEDGED = "ACKNOWLEDGED"
IN_PROGRESS = "IN_PROGRESS"
WAITING = "WAITING_FOR_INFORMATION"
RESOLVED = "RESOLVED"
CLOSED = "CLOSED"
REJECTED = "REJECTED"
REOPENED = "REOPENED"
# An agent asked to reject it; waiting for someone above them to decide.
REJECTION_REQUESTED = "REJECTION_REQUESTED"

STATUS_LABELS = {
    SUBMITTED: "Submitted",
    ASSIGNED: "Assigned",
    ACKNOWLEDGED: "Acknowledged",
    IN_PROGRESS: "In Progress",
    WAITING: "Waiting for Information",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    REJECTED: "Rejected",
    REOPENED: "Reopened",
    REJECTION_REQUESTED: "Rejection Requested",
}

# Citizens never see that a rejection is being considered, only that it is under review.
CITIZEN_STATUS_LABELS = {**STATUS_LABELS, REJECTION_REQUESTED: "Under Review"}

# Coarse buckets for dashboards and filters.
STATUS_GROUPS = {
    "open": [SUBMITTED, ASSIGNED, REOPENED],  # waiting for someone to pick it up
    "in_progress": [ACKNOWLEDGED, IN_PROGRESS, WAITING, REJECTION_REQUESTED],
    "resolved": [RESOLVED, CLOSED],
    "rejected": [REJECTED],
}
GROUP_OF = {s: group for group, statuses in STATUS_GROUPS.items() for s in statuses}
# Complaints that still count toward an officer's workload.
ACTIVE_STATUSES = STATUS_GROUPS["open"] + STATUS_GROUPS["in_progress"]

# Statuses in which the citizen is still waiting for a first response from the handler.
AWAITING_RESPONSE = [SUBMITTED, ASSIGNED, REOPENED]


def status_label(value: str) -> str:
    return STATUS_LABELS.get(value, value)


def citizen_status_label(value: str) -> str:
    return CITIZEN_STATUS_LABELS.get(value, value)
