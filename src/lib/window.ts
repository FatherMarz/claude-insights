// Shared math for the Manual Limit Log "current window" — the rolling 7-day
// period between consecutive Max-plan reset boundaries (default Thu 8 PM
// local). Auto-detects the browser's IANA zone via Intl, so a user in
// Mountain sees Mountain, a user in Berlin sees Berlin. Falls back to
// America/Denver if Intl can't resolve a zone (effectively never on
// modern engines, but cheap insurance).

import type { UsageLogConfig } from '../types.ts';

export const APP_TIMEZONE: string =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver';

const PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

// Short label for displaying the active zone in the UI (e.g., "MDT", "EST",
// "CET"). Browsers usually return a short token here; if the engine returns
// the long form, this still renders sensibly — just longer.
export function timezoneLabel(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    timeZoneName: 'short',
  }).formatToParts(now);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0-6, Sunday=0
}

function getZonedParts(d: Date): ZonedParts {
  const parts = PARTS_FMT.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

// Returns the UTC offset (in ms) of America/Denver at moment `d`. Positive
// when Mountain is ahead of UTC (never — it's always behind), so this is
// always negative for America/Denver. We use it to convert a Mountain
// wall-clock time into a real UTC instant.
function getZoneOffsetMs(d: Date): number {
  const p = getZonedParts(d);
  const wallAsUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtcMs - d.getTime();
}

// Construct a real UTC Date that, when viewed in Mountain time, reads as
// (year, month, day, hour, minute, second). Handles DST by probing the
// offset at the candidate moment and converging in one iteration (good
// enough for any normal date — DST transitions don't move by hours).
function utcFromZonedWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getZoneOffsetMs(guess);
  return new Date(guess.getTime() - offset);
}

export function nextResetAfter(now: Date, config: UsageLogConfig): Date {
  const mt = getZonedParts(now);
  let daysToAdd = (config.resetDayOfWeek - mt.weekday + 7) % 7;
  let candidate = utcFromZonedWallTime(
    mt.year,
    mt.month,
    mt.day + daysToAdd,
    config.resetHour,
    0,
    0
  );
  if (candidate <= now) {
    candidate = utcFromZonedWallTime(
      mt.year,
      mt.month,
      mt.day + daysToAdd + 7,
      config.resetHour,
      0,
      0
    );
  }
  return candidate;
}

export function currentWindowStart(now: Date, config: UsageLogConfig): Date {
  const next = nextResetAfter(now, config);
  // Subtract exactly 7 calendar days in Mountain, accounting for DST shifts.
  const p = getZonedParts(next);
  return utcFromZonedWallTime(p.year, p.month, p.day - 7, p.hour, p.minute, p.second);
}
