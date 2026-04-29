import type { UsageLogEntry } from '../types.ts';

export interface Projection {
  eta: Date;
  slopePerHour: number;
}

// Linear regression on % vs hours-from-window-start. Returns null if fewer than
// 2 points, slope is non-positive, or solution is degenerate.
export function projectHitTime(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): Projection | null {
  const inWindow = entries.filter((e) => {
    const t = new Date(e.timestamp);
    return t >= windowStart && t <= windowEnd;
  });
  if (inWindow.length < 2) return null;
  const xs = inWindow.map(
    (e) => (new Date(e.timestamp).getTime() - windowStart.getTime()) / 3_600_000
  );
  const ys = inWindow.map((e) => e.percent);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  if (slope <= 0) return null;
  const intercept = (sumY - slope * sumX) / n;
  const xAt100 = (100 - intercept) / slope;
  const eta = new Date(windowStart.getTime() + xAt100 * 3_600_000);
  return { eta, slopePerHour: slope };
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
