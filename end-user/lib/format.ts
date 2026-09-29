/**
 * Dates and numbers for display. The API sends naive UTC timestamps. Times are
 * shown in the organisation's time zone (Settings), so the portal and the
 * staff see the same clock.
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

/** "27 Sep 2026, 09:10 AM" */
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

/** "27 Sep, 09:10 AM" (for lists where the year is obvious). */
export function formatWhen(iso: string): string {
  return parseUtc(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: displayTimeZone,
    ...zoneLabel(),
  });
}

/** Today (YYYY-MM-DD) in the display time zone, for date inputs. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: displayTimeZone,
  }).format(new Date());
}

/** The hour of the day on the viewer's own clock (a greeting follows where they are). */
export function currentHour(): number {
  return new Date().getHours();
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase();
}

/** "Mansarovar, Jaipur": the place and the next distinct level up. */
export function shortPlace(location: { name: string; path_names: string[] }): string {
  const names = [...new Set([...location.path_names].reverse())].slice(0, 2);
  return names.length ? names.join(", ") : location.name;
}
