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
import type { CreditLogEntry, UsageLogFile } from '../types.ts';
import { APP_TIMEZONE, currentWindowStart, nextResetAfter } from '../lib/window.ts';
import { projectHitTime, PROJECTION_ALGORITHMS } from '../lib/projection.ts';

const COLORS = { bar: '#5dd66c' };
// Per-account colors for the actual-readings lines. Add more if you ever
// introduce a third account. Exported so ChartLegend stays in sync.
export const ACCOUNT_COLORS: Record<string, string> = {
  personal: '#5dd66c', // green — keeps parity with old single-line color
  work: '#5aaef0',     // blue
  legacy: '#80796d',   // dim — untagged historical entries
};
export const ACCOUNT_LABEL: Record<string, string> = {
  personal: 'Personal',
  work: 'Work',
  legacy: 'Legacy',
};
export const ACCOUNT_ORDER = ['personal', 'work', 'legacy'] as const;
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
  creditEntries?: CreditLogEntry[];
  anchorDollars?: number | null;
  firstHundredAt?: string | null;
}

// Compact embedded version of the Usage tab's hero chart — locked to the
// current window. Solid line = logged readings, dashed = linear projection,
// vertical markers = now / reset / 100% ETA.
export function WindowChart({
  usageLog,
  height = 200,
  now: nowProp,
  creditEntries,
  anchorDollars,
  firstHundredAt,
}: Props) {
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);

  const derived = useMemo(() => {
    if (!usageLog) return null;
    const windowStart = currentWindowStart(now, usageLog.config);
    let windowEnd = nextResetAfter(windowStart, usageLog.config);

    // Pick the most recent seven_day_resets_at per account so each account's
    // real reset boundary can be drawn as its own vertical line. Falls back to
    // the global config's windowEnd if an account has no logged reset yet.
    const accountResets = new Map<string, number>(); // epoch ms
    const latestByAccount = new Map<string, (typeof usageLog.entries)[number]>();
    for (const e of usageLog.entries) {
      const acct = e.account || 'legacy';
      const prev = latestByAccount.get(acct);
      if (!prev || e.timestamp > prev.timestamp) latestByAccount.set(acct, e);
    }
    for (const [acct, e] of latestByAccount) {
      if (typeof e.seven_day_resets_at === 'number' && e.seven_day_resets_at > 0) {
        accountResets.set(acct, e.seven_day_resets_at * 1000);
      }
    }
    // Expand the X-axis right edge so per-account reset lines always fit.
    for (const ms of accountResets.values()) {
      if (ms > windowEnd.getTime()) windowEnd = new Date(ms);
    }

    const inWindow = usageLog.entries
      .filter((e) => {
        const t = new Date(e.timestamp);
        return t >= windowStart && t <= windowEnd;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const projection = projectHitTime(usageLog.entries, windowStart, windowEnd);
    const algoProjections = PROJECTION_ALGORITHMS.map((algo) => ({
      algo,
      projection: algo.compute(usageLog.entries, windowStart, windowEnd),
    }));

    type ChartPoint = {
      t: number;
      synthetic?: number;
    } & Partial<Record<`actual_${string}`, number>> &
      Partial<Record<`proj_${string}`, number>>;
    const chartPoints: ChartPoint[] = [];

    // Split readings by account so each plan's burn gets its own line.
    // Entries without an `account` field (legacy manual logs) get bucketed
    // under "legacy" so they don't visually merge with either current account.
    const byAccount = new Map<string, typeof inWindow>();
    for (const e of inWindow) {
      const acct = e.account || 'legacy';
      const arr = byAccount.get(acct) ?? [];
      arr.push(e);
      byAccount.set(acct, arr);
    }
    const accounts = Array.from(byAccount.keys());

    // Anchor each account's line at 0% at window start (usage resets at the boundary).
    for (const acct of accounts) {
      chartPoints.push({ t: windowStart.getTime(), [`actual_${acct}`]: 0 });
      for (const e of byAccount.get(acct)!) {
        chartPoints.push({
          t: new Date(e.timestamp).getTime(),
          [`actual_${acct}`]: e.percent,
        });
      }
    }

    // Single projection (across all readings) kept for the overage warning line.
    const latest = inWindow[inWindow.length - 1] ?? null;
    for (const { algo, projection: p } of algoProjections) {
      if (!p || !latest) continue;
      const key = `proj_${algo.id}` as const;
      const startMs = new Date(latest.timestamp).getTime();
      const endMs = Math.min(windowEnd.getTime(), p.eta.getTime());
      const elapsedH = (endMs - startMs) / 3_600_000;
      const projectedAtEnd = latest.percent + p.slopePerHour * elapsedH;
      chartPoints.push({ t: startMs, [key]: latest.percent });
      chartPoints.push({
        t: endMs,
        [key]: Math.min(100, Math.max(0, projectedAtEnd)),
      });
    }

    // Synthetic >100% line: one stepped point per credit entry. Anchored at
    // firstHundredAt = 100, then each credit dollar adds (100 / anchor) pts.
    let syntheticMax = 100;
    if (
      anchorDollars &&
      anchorDollars > 0 &&
      firstHundredAt &&
      creditEntries &&
      creditEntries.length > 0
    ) {
      const anchorMs = new Date(firstHundredAt).getTime();
      chartPoints.push({ t: anchorMs, synthetic: 100 });
      const sorted = [...creditEntries]
        .filter((c) => c.timestamp >= firstHundredAt)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let cum = 0;
      for (const c of sorted) {
        cum += c.dollars;
        const pct = 100 + (cum / anchorDollars) * 100;
        chartPoints.push({ t: new Date(c.timestamp).getTime(), synthetic: pct });
        if (pct > syntheticMax) syntheticMax = pct;
      }
      // Hold the synthetic line out to "now" so the user can see where they are.
      if (sorted.length > 0) {
        const lastCreditMs = new Date(sorted[sorted.length - 1].timestamp).getTime();
        if (now.getTime() > lastCreditMs) {
          chartPoints.push({ t: now.getTime(), synthetic: syntheticMax });
        }
      }
    }
    chartPoints.sort((a, b) => a.t - b.t);

    const willOverage = !!projection && projection.eta < windowEnd;
    const yMax = Math.max(100, Math.ceil((syntheticMax + 10) / 10) * 10);
    return {
      windowStart,
      windowEnd,
      chartPoints,
      projection,
      algoProjections,
      willOverage,
      yMax,
      accounts,
      accountResets,
    };
  }, [usageLog, now, creditEntries, anchorDollars, firstHundredAt]);

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

  const {
    windowStart,
    windowEnd,
    chartPoints,
    projection,
    algoProjections,
    willOverage,
    yMax,
    accounts,
    accountResets,
  } = derived;
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
          domain={[0, yMax]}
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
          strokeWidth={2}
          strokeDasharray="4 3"
          label={{ value: 'now', position: 'top', fill: '#e8c547', fontSize: 10 }}
        />
        {accountResets.size > 0 ? (
          Array.from(accountResets.entries()).map(([acct, ms]) => {
            const color = ACCOUNT_COLORS[acct] ?? '#5dd66c';
            const label = ACCOUNT_LABEL[acct] ?? acct;
            return (
              <ReferenceLine
                key={`reset-${acct}`}
                x={ms}
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 3"
                label={{
                  value: `${label} reset`,
                  position: 'top',
                  fill: color,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            );
          })
        ) : (
          <ReferenceLine
            x={windowEndMs}
            stroke="#5dd66c"
            strokeWidth={3}
            label={{ value: 'reset', position: 'top', fill: '#5dd66c', fontSize: 10, fontWeight: 600 }}
          />
        )}
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
          strokeWidth={2}
          strokeDasharray="1 2"
          label={{ value: 'limit', position: 'right', fill: '#d94f4f', fontSize: 10 }}
        />
        {accounts.map((acct) => {
          const color = ACCOUNT_COLORS[acct] ?? COLORS.bar;
          const label = ACCOUNT_LABEL[acct] ?? acct;
          return (
            <Line
              key={acct}
              type="monotone"
              dataKey={`actual_${acct}`}
              name={label}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              connectNulls
            />
          );
        })}
        {[...algoProjections].reverse().map(({ algo, projection: p }) =>
          p ? (
            <Line
              key={algo.id}
              type="linear"
              dataKey={`proj_${algo.id}`}
              name={algo.label}
              stroke={algo.color}
              strokeWidth={algo.strokeWidth}
              strokeDasharray={algo.dashArray}
              strokeLinecap="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null
        )}
        <Line
          type="linear"
          dataKey="synthetic"
          stroke="#c4684a"
          strokeWidth={2}
          dot={{ r: 3, fill: '#c4684a' }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
