/**
 * Dates and numbers for display. The API sends naive UTC timestamps and plain
 * dates (YYYY-MM-DD, days in the organisation's time zone). Times are shown in
 * the organisation's time zone (Settings), so everyone reads the same clock.
 */

let displayTimeZone = "UTC";
// Until the time zone is set in Settings, times are shown in UTC and labelled as such
// (rather than in each viewer's own zone, which would make people see different clocks).
let labelZone = true;

export function setDisplayTimeZone(timeZone: string | null) {
  displayTimeZone = timeZone ?? "UTC";
  labelZone = timeZone === null;
}

const zoneLabel = () => (labelZone ? { timeZoneName: "short" as const } : {});

function parseUtc(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return parseUtc(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: displayTimeZone,
    ...zoneLabel(),
  });
}

/** A calendar date from the API (already a local day), e.g. "2026-09-27" -> "27 Sep". */
export function formatDay(day: string, withYear = false): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Today's date (YYYY-MM-DD) in the display time zone, minus `daysAgo`. */
export function isoDay(daysAgo = 0): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: displayTimeZone,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") - daysAgo));
  return date.toISOString().slice(0, 10);
}

export function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  return hours >= 48 ? `${(hours / 24).toFixed(1)} d` : `${hours.toFixed(1)} h`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "mobile number or email address", for the channels end users can sign in with. */
export function channelNames(channels: ("sms" | "email")[]): string {
  return channels.map((c) => (c === "sms" ? "mobile number" : "email address")).join(" or ");
}

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}
