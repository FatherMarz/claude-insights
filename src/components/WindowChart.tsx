import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UsageLogFile } from '../types.ts';
import { APP_TIMEZONE, currentWindowStart, nextResetAfter } from '../lib/window.ts';
import { projectHitTime } from '../lib/projection.ts';

const COLORS = { bar: '#5dd66c', amber: '#f4a627' };
const GRID_STROKE = 'rgba(232, 226, 214, 0.07)';
const AXIS_STROKE = '#80796d';

const tooltipStyle = {
  background: '#25211c',
  border: '1px solid rgba(232, 226, 214, 0.22)',
  borderRadius: 3,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  color: '#e8e2d6',
  padding: '8px 10px',
};
const labelStyle = { color: '#e8e2d6', fontWeight: 500 };
const itemStyle = { color: '#e8e2d6' };

interface Props {
  usageLog: UsageLogFile | null;
  height?: number;
  now?: Date;
}

// Compact embedded version of the Usage tab's hero chart — locked to the
// current window. Solid line = logged readings, dashed = linear projection,
// vertical markers = now / reset / 100% ETA.
export function WindowChart({ usageLog, height = 200, now: nowProp }: Props) {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);

  const derived = useMemo(() => {
    if (!usageLog) return null;
    const windowStart = currentWindowStart(now, usageLog.config);
    const windowEnd = nextResetAfter(windowStart, usageLog.config);
    const inWindow = usageLog.entries
      .filter((e) => {
        const t = new Date(e.timestamp);
        return t >= windowStart && t <= windowEnd;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const projection = projectHitTime(usageLog.entries, windowStart, windowEnd);

    const chartPoints: { t: number; actual?: number; projected?: number }[] = [];
    for (const e of inWindow) {
      chartPoints.push({ t: new Date(e.timestamp).getTime(), actual: e.percent });
    }
    const latest = inWindow[inWindow.length - 1] ?? null;
    if (projection && latest) {
      const startMs = new Date(latest.timestamp).getTime();
      const endMs = Math.min(windowEnd.getTime(), projection.eta.getTime());
      const elapsedH = (endMs - startMs) / 3_600_000;
      const projectedAtEnd = latest.percent + projection.slopePerHour * elapsedH;
      chartPoints.push({ t: startMs, projected: latest.percent });
      chartPoints.push({
        t: endMs,
        projected: Math.min(100, Math.max(0, projectedAtEnd)),
      });
    }
    chartPoints.sort((a, b) => a.t - b.t);

    const willOverage = !!projection && projection.eta < windowEnd;
    return { windowStart, windowEnd, chartPoints, projection, willOverage };
  }, [usageLog, now]);

  const dayHourFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        timeZone: APP_TIMEZONE,
      }),
    []
  );
  const fullFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: APP_TIMEZONE,
      }),
    []
  );

  if (!derived) {
    return (
      <div className="empty" style={{ minHeight: height }}>
        Loading current-window data…
      </div>
    );
  }

  const { windowStart, windowEnd, chartPoints, projection, willOverage } = derived;
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const xTicks: number[] = [];
  for (let t = windowStartMs; t <= windowEndMs; t += 24 * 3_600_000) xTicks.push(t);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartPoints} margin={{ top: 24, right: 70, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
        <XAxis
          dataKey="t"
          type="number"
          domain={[windowStartMs, windowEndMs]}
          ticks={xTicks}
          stroke={AXIS_STROKE}
          fontSize={10}
          tickFormatter={(t: number) => dayHourFmt.format(new Date(t))}
        />
        <YAxis
          stroke={AXIS_STROKE}
          fontSize={10}
          domain={[0, 100]}
          tickFormatter={(p) => `${p}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          itemStyle={itemStyle}
          labelFormatter={(t: number) => fullFmt.format(new Date(t))}
          formatter={(v: number) => `${v?.toFixed?.(1) ?? v}%`}
        />
        <ReferenceLine
          x={now.getTime()}
          stroke="#e8c547"
          strokeDasharray="3 3"
          label={{ value: 'now', position: 'top', fill: '#e8c547', fontSize: 10 }}
        />
        <ReferenceLine
          x={windowEndMs}
          stroke="#5dd66c"
          strokeWidth={2}
          label={{ value: 'reset', position: 'top', fill: '#5dd66c', fontSize: 10, fontWeight: 600 }}
        />
        {willOverage && projection && (
          <ReferenceLine
            x={projection.eta.getTime()}
            stroke="#d94f4f"
            strokeDasharray="4 3"
            strokeWidth={2}
            label={{
              value: '100%',
              position: 'top',
              fill: '#d94f4f',
              fontSize: 10,
              fontWeight: 600,
            }}
          />
        )}
        <ReferenceLine
          y={100}
          stroke="#d94f4f"
          strokeDasharray="3 3"
          label={{ value: 'limit', position: 'right', fill: '#d94f4f', fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={COLORS.bar}
          strokeWidth={2}
          dot={{ r: 3, fill: COLORS.bar }}
          connectNulls
        />
        <Line
          type="linear"
          dataKey="projected"
          stroke={COLORS.amber}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
