import type { UsageLogEntry } from '../types.ts';

export interface Projection {
  eta: Date;
  slopePerHour: number;
}

export type ProjectionAlgorithmId =
  | 'fullWindow'
  | 'trailing'
  | 'lastTwo'
  | 'activeBurn'
  | 'ewma';

export interface ProjectionAlgorithm {
  id: ProjectionAlgorithmId;
  label: string;
  color: string;
  dashArray: string;
  strokeWidth: number;
  describe: string;
  compute: (
    entries: UsageLogEntry[],
    windowStart: Date,
    windowEnd: Date
  ) => Projection | null;
}

const TRAILING_WINDOW_MS = 60 * 60_000;
const MIN_TRAILING_POINTS = 5;
const EWMA_HALF_LIFE_HOURS = 0.5;

function inWindowSorted(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): UsageLogEntry[] {
  return entries
    .filter((e) => {
      const t = new Date(e.timestamp);
      return t >= windowStart && t <= windowEnd;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function fitLine(
  points: UsageLogEntry[],
  windowStart: Date
): { slope: number; intercept: number } | null {
  if (points.length < 2) return null;
  const xs = points.map(
    (e) => (new Date(e.timestamp).getTime() - windowStart.getTime()) / 3_600_000
  );
  const ys = points.map((e) => e.percent);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function etaFromFit(
  fit: { slope: number; intercept: number },
  windowStart: Date
): Projection {
  const xAt100 = (100 - fit.intercept) / fit.slope;
  const eta = new Date(windowStart.getTime() + xAt100 * 3_600_000);
  return { eta, slopePerHour: fit.slope };
}

function fullWindow(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  const sorted = inWindowSorted(entries, windowStart, windowEnd);
  const fit = fitLine(sorted, windowStart);
  if (!fit || fit.slope <= 0) return null;
  return etaFromFit(fit, windowStart);
}

function trailing(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  const sorted = inWindowSorted(entries, windowStart, windowEnd);
  if (sorted.length < 2) return null;
  const latestMs = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const cutoffMs = latestMs - TRAILING_WINDOW_MS;
  const byTime = sorted.filter((e) => new Date(e.timestamp).getTime() >= cutoffMs);
  const byCount = sorted.slice(-MIN_TRAILING_POINTS);
  const slice = byTime.length >= byCount.length ? byTime : byCount;
  const trailingFit = fitLine(slice, windowStart);
  const fit =
    trailingFit && trailingFit.slope > 0 ? trailingFit : fitLine(sorted, windowStart);
  if (!fit || fit.slope <= 0) return null;
  return etaFromFit(fit, windowStart);
}

function lastTwo(
  entries: UsageLogEntry[],
  windowStart: Date,
  _windowEnd: Date
): Projection | null {
  const sorted = inWindowSorted(entries, windowStart, _windowEnd);
  if (sorted.length < 2) return null;
  const a = sorted[sorted.length - 2];
  const b = sorted[sorted.length - 1];
  const aMs = new Date(a.timestamp).getTime();
  const bMs = new Date(b.timestamp).getTime();
  const dH = (bMs - aMs) / 3_600_000;
  if (dH <= 0) return null;
  const slopePerHour = (b.percent - a.percent) / dH;
  if (slopePerHour <= 0) return null;
  const hoursTo100 = (100 - b.percent) / slopePerHour;
  const eta = new Date(bMs + hoursTo100 * 3_600_000);
  return { eta, slopePerHour };
}

function activeBurn(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  const sorted = inWindowSorted(entries, windowStart, windowEnd);
  if (sorted.length < 2) return null;
  let totalPct = 0;
  let totalHours = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dPct = sorted[i].percent - sorted[i - 1].percent;
    if (dPct > 0) {
      const dH =
        (new Date(sorted[i].timestamp).getTime() -
          new Date(sorted[i - 1].timestamp).getTime()) /
        3_600_000;
      totalPct += dPct;
      totalHours += dH;
    }
  }
  if (totalHours <= 0 || totalPct <= 0) return null;
  const slopePerHour = totalPct / totalHours;
  const latest = sorted[sorted.length - 1];
  const latestMs = new Date(latest.timestamp).getTime();
  const hoursTo100 = (100 - latest.percent) / slopePerHour;
  const eta = new Date(latestMs + hoursTo100 * 3_600_000);
  return { eta, slopePerHour };
}

function ewma(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  const sorted = inWindowSorted(entries, windowStart, windowEnd);
  if (sorted.length < 2) return null;
  const latestMs = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const lambda = Math.log(2) / EWMA_HALF_LIFE_HOURS;
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXY = 0;
  let sumWXX = 0;
  for (const e of sorted) {
    const t = new Date(e.timestamp).getTime();
    const x = (t - windowStart.getTime()) / 3_600_000;
    const y = e.percent;
    const ageH = (latestMs - t) / 3_600_000;
    const w = Math.exp(-lambda * ageH);
    sumW += w;
    sumWX += w * x;
    sumWY += w * y;
    sumWXY += w * x * y;
    sumWXX += w * x * x;
  }
  const denom = sumW * sumWXX - sumWX * sumWX;
  if (denom === 0) return null;
  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
  if (slope <= 0) return null;
  const intercept = (sumWY - slope * sumWX) / sumW;
  return etaFromFit({ slope, intercept }, windowStart);
}

export const PROJECTION_ALGORITHMS: ProjectionAlgorithm[] = [
  {
    id: 'fullWindow',
    label: 'Full window OLS',
    color: '#ff5fb0',
    dashArray: '10 4',
    strokeWidth: 2,
    describe: 'Linear fit across every reading in the window',
    compute: fullWindow,
  },
  {
    id: 'trailing',
    label: 'Trailing 60 min',
    color: '#f4a627',
    dashArray: '6 3',
    strokeWidth: 2,
    describe: 'Linear fit on the last 60 min / 5 readings',
    compute: trailing,
  },
  {
    id: 'lastTwo',
    label: 'Last 2 points',
    color: '#00d4ff',
    dashArray: '2 3',
    strokeWidth: 2.5,
    describe: 'Slope between the last two readings',
    compute: lastTwo,
  },
  {
    id: 'activeBurn',
    label: 'Active-burn only',
    color: '#c084ff',
    dashArray: '10 3 2 3',
    strokeWidth: 2,
    describe: 'Average rate across intervals where % increased; ignores idle',
    compute: activeBurn,
  },
  {
    id: 'ewma',
    label: 'EWMA (30 min half-life)',
    color: '#ff8c42',
    dashArray: '4 6',
    strokeWidth: 2,
    describe: 'Weighted regression, recent points dominate',
    compute: ewma,
  },
];

// Primary projection used by status strips and chart references. Trailing-60
// is the default — responsive without being as noisy as last-two.
export function projectHitTime(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  return trailing(entries, windowStart, windowEnd);
}

export function projectHitTimeFullWindow(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  return fullWindow(entries, windowStart, windowEnd);
}

export interface WindowSummary {
  latest: UsageLogEntry | null;
  peak: number;
  count: number;
  projection: Projection | null;
}

export function summarizeWindow(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): WindowSummary {
  const inWindow = entries.filter((e) => {
    const t = new Date(e.timestamp);
    return t >= windowStart && t <= windowEnd;
  });
  const sorted = [...inWindow].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = sorted[sorted.length - 1] ?? null;
  const peak = inWindow.reduce((m, e) => Math.max(m, e.percent), 0);
  return {
    latest,
    peak,
    count: inWindow.length,
    projection: projectHitTime(entries, windowStart, windowEnd),
  };
}
