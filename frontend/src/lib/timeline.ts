/**
 * Helper to translate timeline log messages dynamically into the active language.
 */
export function formatTimelineMessage(
  message: string,
  t: (key: string, paramsOrFallback?: string | Record<string, string | number>) => string,
): string {
  if (!message) return "";

  // 1. Direct dictionary match
  const direct = t(message);
  if (direct !== message) return direct;

  // 2. Status changed from <FROM> to <TO>
  const statusMatch = message.match(/^Status changed from (.*?) to (.*)$/i);
  if (statusMatch) {
    const fromStatus = statusMatch[1].trim();
    const toStatus = statusMatch[2].trim();
    return t("Status changed from {from} to {to}", {
      from: t(fromStatus),
      to: t(toStatus),
    });
  }

  // 3. Assigned to a member of the <DEPT> department
  const assignDeptMatch = message.match(/^Assigned to a member of the (.*?) department$/i);
  if (assignDeptMatch) {
    return t("Assigned to a member of the {dept} department", {
      dept: assignDeptMatch[1].trim(),
    });
  }

  // 4. Received by the <DEPT> department
  const recDeptMatch = message.match(/^Received by the (.*?) department$/i);
  if (recDeptMatch) {
    return t("Received by the {dept} department", {
      dept: recDeptMatch[1].trim(),
    });
  }

  // 5. Forwarded to the <DEPT> department
  const fwdDeptMatch = message.match(/^Forwarded to the (.*?) department$/i);
  if (fwdDeptMatch) {
    return t("Forwarded to the {dept} department", {
      dept: fwdDeptMatch[1].trim(),
    });
  }

  // 6. Rated the resolution X/5
  const ratingMatch = message.match(/(?:you|end user) rated the resolution (\d+)\/5/i);
  if (ratingMatch) {
    return t("You rated the resolution {rating}/5", { rating: ratingMatch[1] });
  }

  // 7. Auto-assigned to / Reassigned to / Assigned to / Unassigned from / Escalated to <NAME>
  const autoAssignMatch = message.match(/^Auto-assigned to (.*)$/i);
  if (autoAssignMatch) {
    return `${t("Auto-assigned to")} ${autoAssignMatch[1]}`;
  }
  const reassignMatch = message.match(/^Reassigned to (.*)$/i);
  if (reassignMatch) {
    return `${t("Reassigned to")} ${reassignMatch[1]}`;
  }
  const assignPersonMatch = message.match(/^Assigned to (.*)$/i);
  if (assignPersonMatch) {
    return `${t("Assigned to")} ${assignPersonMatch[1]}`;
  }
  const unassignMatch = message.match(/^Unassigned from (.*)$/i);
  if (unassignMatch) {
    return `${t("Unassigned from")} ${unassignMatch[1]}`;
  }
  const escalatedToMatch = message.match(/^Escalated to (.*)$/i);
  if (escalatedToMatch) {
    return `${t("Escalated to")} ${escalatedToMatch[1]}`;
  }

  // 8. Reclassified: Complaint moved to the X department, etc.
  const movedDeptMatch = message.match(/moved to the (.*?) department/i);
  if (movedDeptMatch) {
    return `${t("Complaint")} ${t("moved to the {dept} department", { dept: movedDeptMatch[1].trim() })}`;
  }

  return message;
}
