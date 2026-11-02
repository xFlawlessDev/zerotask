import type { ClassValue } from "clsx";

/**
 * Minimal class joiner. The project has no utility-merging dependency because
 * every component composes classes from tokens, never from arbitrary caller
 * strings that could collide.
 */
export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) out.push(nested);
    } else if (typeof value === "object") {
      for (const [key, enabled] of Object.entries(value)) {
        if (enabled) out.push(key);
      }
    }
  }
  return out.join(" ");
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

/**
 * Dates travel as `YYYY-MM-DD` and are formatted in UTC on purpose: a schedule
 * day is not an instant, and parsing it in local time shifts it a day west of
 * Greenwich and a day east of it.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return "No date";
  return DATE_FORMAT.format(parsed);
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) return "No date";
  return SHORT_DATE.format(parsed);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Durations carry their unit wherever they appear, so a column is readable alone. */
export function formatDuration(days: number | null | undefined): string {
  if (days === null || days === undefined) return "Not set";
  if (days === 0) return "Same day";
  return `${days}d`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0%";
  return `${Math.round(value)}%`;
}

export function formatHours(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "0h";
  const hours = typeof value === "string" ? Number.parseFloat(value) : value;
  if (Number.isNaN(hours)) return "0h";
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/** Signed day difference, for a variance that can go either way. */
export function formatVariance(days: number | null | undefined): string {
  if (days === null || days === undefined) return "No target set";
  if (days === 0) return "On schedule";
  if (days > 0) return `${days}d late`;
  return `${Math.abs(days)}d early`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const base = Date.parse(`${iso}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole working days between two dates, exclusive of the start. */
export function workingDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return 0;

  let days = 0;
  for (let cursor = from + 86_400_000; cursor <= to; cursor += 86_400_000) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return days;
}

export function isOverdue(iso: string | null | undefined, status: string): boolean {
  if (!iso) return false;
  if (status === "completed" || status === "cancelled") return false;
  return iso.slice(0, 10) < todayIso();
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/u).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Greeting-free page description helper: an ISO week label, as planners say it. */
export function isoWeekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const janFirst = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - janFirst.getTime()) / 86_400_000 + janFirst.getUTCDay() + 1) / 7,
  );
  return `W${String(week).padStart(2, "0")}`;
}
