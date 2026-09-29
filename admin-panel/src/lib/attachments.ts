import { PublicConfig } from "./api";

/**
 * Why these files can't be attached, following the limits in Settings, or null
 * when they can. The API checks again; this only says so before uploading.
 * `room` is how many more files the complaint may take.
 */
export function attachmentProblem(files: File[], room: number, rules: PublicConfig["attachments"]): string | null {
  const allowed = new Set(rules.allowed_types);
  const wrongType = files.find((f) => !allowed.has(f.name.split(".").pop()?.toLowerCase() ?? ""));
  if (wrongType) return `${wrongType.name}: that type of file can't be attached (allowed: ${rules.allowed_types.join(", ")}).`;
  const limit = rules.max_mb;
  const tooBig = limit === null ? undefined : files.find((f) => f.size > limit * 1024 * 1024);
  if (tooBig) return `${tooBig.name} is larger than ${limit} MB.`;
  if (files.length > room) return `Only ${room} more file${room === 1 ? "" : "s"} can be attached to this complaint.`;
  return null;
}
