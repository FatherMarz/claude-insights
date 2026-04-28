// Centralized timezone-aware bucketing for server aggregations. Auto-detects
// the host's IANA zone via Intl so the Activity / Operations / Quality /
// History tabs bucket "by day" and "by hour" using local wall-clock. Override
// with the TZ env var (or APP_TIMEZONE) if you need to pin it explicitly —
// useful when the server runs in a different zone than the human reading the
// dashboard.

export const APP_TIMEZONE: string =
  process.env.APP_TIMEZONE ||
  process.env.TZ ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'UTC';

const PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
}

function partsOf(ts: string | number | Date): ZonedParts {
  const d = ts instanceof Date ? ts : new Date(ts);
  const parts = PARTS_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
  };
}

// "YYYY-MM-DD" Mountain date string. Use as a bucket key in place of
// `ts.slice(0, 10)` (which keys by UTC date and silently misbuckets late
// evenings — e.g. 9 PM Mountain Apr 28 has UTC date Apr 29).
export function dateKeyMt(ts: string | number | Date): string {
  const p = partsOf(ts);
  return `${p.year}-${p.month}-${p.day}`;
}

// Hour 0-23 in Mountain. Use in place of `new Date(ts).getUTCHours()`.
export function hourMt(ts: string | number | Date): number {
  return Number(partsOf(ts).hour);
}
