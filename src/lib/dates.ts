const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Local-time yyyy-mm-dd (avoids the UTC shift of `toISOString`). */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/** Next occurrence of `weekday` (0=Sun..6=Sat), strictly after `from`. */
export function nextWeekday(from: Date, weekday: number): Date {
  const out = new Date(from);
  let delta = (weekday - out.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  out.setDate(out.getDate() + delta);
  return out;
}

/**
 * Best-effort natural-language date parsing for absence reporting.
 * Returns an ISO `yyyy-mm-dd` string or `undefined` if it cannot parse.
 */
export function parseDateHint(text: string, now: Date = new Date()): string | undefined {
  const t = text.toLowerCase().trim();

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  if (/\btoday\b/.test(t)) return toIsoDate(now);
  if (/\btomorrow\b/.test(t)) return toIsoDate(addDays(now, 1));

  for (let i = 0; i < 7; i++) {
    const wd = WEEKDAYS[i]!;
    if (t.includes(wd.slice(0, 3)) || t.includes(wd)) {
      return toIsoDate(nextWeekday(now, i));
    }
  }

  const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
  if (md) {
    const month = MONTHS[md[1]!.slice(0, 3)];
    const day = Number(md[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getFullYear();
      return toIsoDate(new Date(year, month, day));
    }
  }

  if (/\bnext week\b/.test(t)) return toIsoDate(addDays(now, 7));

  return undefined;
}

/**
 * For scheduling: turn a free-text "when" hint into a search window. Falls back
 * to next Monday → next Monday (one week) when the hint is ambiguous.
 */
export function dateWindow(hint: string, now: Date = new Date()): { from: Date; to: Date } {
  const parsed = parseDateHint(hint, now);
  if (parsed) {
    const d = new Date(`${parsed}T00:00:00`);
    return { from: startOfDay(d), to: endOfDay(d) };
  }
  const from = nextWeekday(now, 1); // next Monday
  return { from: startOfDay(from), to: endOfDay(addDays(from, 7)) };
}

export function formatDate(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Force UTC so a bare calendar date doesn't shift in negative-offset zones.
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Parse a parent's free-text "when" into a concrete Date for a reminder.
 * Understands "in N minutes/hours/days/weeks", today/tomorrow/next week, weekdays,
 * "month day", and time-of-day words ("morning"=9am, "afternoon"=2pm,
 * "evening"/"tonight"=6pm) plus "at H(:MM) am/pm". Falls back to one hour from
 * now. If the parsed day+time is already past, it rolls to the next day.
 */
export function parseReminderWhen(when: string, now: Date = new Date()): Date {
  const t = (when ?? '').toLowerCase().trim();

  // "in 30 minutes" / "in 2 hours" / "in 3 days" / "in 1 week"
  const inMatch = t.match(/in\s+(\d+)\s*(minute|min|hour|hrs?|day|week)/);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const u = inMatch[2]!;
    const ms = /min/.test(u) ? 60_000 : /hour|hr/.test(u) ? 3_600_000 : /day/.test(u) ? 86_400_000 : 604_800_000;
    return new Date(now.getTime() + n * ms);
  }

  // Base calendar day from a hint (today / tomorrow / weekday / next week / month day).
  const baseIso = parseDateHint(when, now);
  const base = baseIso ? new Date(`${baseIso}T00:00:00`) : null;

  // Time of day — only when it's clearly a time (has am/pm or a colon), so we
  // never misread e.g. "the 504 plan" or "grade 1".
  let hour = 9;
  let minute = 0;
  let explicitTime = false;
  const tm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/) || t.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    let h = Number(tm[1]);
    const m = tm[2] ? Number(tm[2]) : 0;
    const mer = tm[3]?.toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    else if (mer === 'am' && h === 12) h = 0;
    hour = h;
    minute = m;
    explicitTime = true;
  } else if (/morning/.test(t)) {
    hour = 9;
    explicitTime = true;
  } else if (/afternoon/.test(t)) {
    hour = 14;
    explicitTime = true;
  } else if (/\b(evening|night|tonight)\b/.test(t)) {
    hour = 18;
    explicitTime = true;
  }

  if (base) {
    const d = new Date(base);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (explicitTime) {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  // Ambiguous date + time -> default to an hour from now.
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/** Friendly "when" for a reminder confirmation, e.g. "Fri, Sep 12 at 9:00 AM". */
export function formatReminderWhen(d: Date): string {
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
