import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import type { UsageLogConfig, UsageLogEntry } from '../types.ts';
import {
  deleteUsageLogEntry,
  fetchInsights,
  fetchUsageLog,
  postUsageLogEntry,
} from '../api.ts';
import { APP_TIMEZONE, currentWindowStart, nextResetAfter } from '../lib/window.ts';

const COLORS = {
  bar: '#5dd66c',
  amber: '#f4a627',
};

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

function KpiCard({
  label,
  value,
  sub,
  tone,
  wide,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  wide?: boolean;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    good: '#5dd66c',
    warn: '#f4a627',
    bad: '#d94f4f',
    neutral: '#e8e2d6',
  };
  const style: React.CSSProperties = {};
  if (wide) style.gridColumn = 'span 2';
  if (onClick) style.cursor = 'pointer';
  return (
    <div
      className="kpi"
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: colorMap[tone ?? 'neutral'] }}>
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// Math: linear projection from logged points. Window helpers are in ../lib/window.

function projectHitTime(
  entries: UsageLogEntry[],
  windowStart: Date,
  windowEnd: Date
): { eta: Date; slopePerHour: number } | null {
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

function formatRelativeFromNow(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime();
  const sign = diffMs >= 0 ? 'in ' : '';
  const past = diffMs < 0 ? ' ago' : '';
  const abs = Math.abs(diffMs);
  const hours = abs / 3_600_000;
  if (hours < 1) {
    const mins = Math.round(abs / 60_000);
    return `${sign}${mins}m${past}`;
  }
  if (hours < 36) {
    return `${sign}${hours.toFixed(1)}h${past}`;
  }
  const days = abs / 86_400_000;
  return `${sign}${days.toFixed(1)}d${past}`;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toString();
}

function formatShort(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  });
}

// ---------------------------------------------------------------------------
// Usage tab — Limit Log only. Range bar is hidden for this tab in App.tsx
// because nothing here is range-driven; the window auto-slides on its own.
// ---------------------------------------------------------------------------

function LimitLogSection({ refreshKey }: { refreshKey?: number }) {
  const [config, setConfig] = useState<UsageLogConfig | null>(null);
  const [entries, setEntries] = useState<UsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [percentInput, setPercentInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const formDialog = useRef<HTMLDialogElement>(null);
  const entriesDialog = useRef<HTMLDialogElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await fetchUsageLog();
      setConfig(data.config);
      setEntries(data.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }

  // Initial load + re-fetch when App-level Refresh bumps refreshKey.
  useEffect(() => {
    refresh();
  }, [refreshKey]);

  // 3s poll → /log-usage readings appear within seconds.
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
      fetchUsageLog()
        .then((data) => {
          setConfig(data.config);
          setEntries(data.entries);
        })
        .catch(() => {});
    }, 3_000);
    return () => window.clearInterval(id);
  }, []);

  function openForm() {
    setError(null);
    setPercentInput('');
    setNoteInput('');
    formDialog.current?.showModal();
  }

  function closeForm() {
    formDialog.current?.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const percent = Number(percentInput);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError('Enter a number between 0 and 100');
      return;
    }
    try {
      await postUsageLogEntry({ percent, note: noteInput.trim() || undefined });
      setPercentInput('');
      setNoteInput('');
      setError(null);
      closeForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteUsageLogEntry(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to delete');
    }
  }

  // Click-outside-content closes the dialog.
  function handleDialogClick(
    e: React.MouseEvent<HTMLDialogElement>,
    ref: React.RefObject<HTMLDialogElement | null>
  ) {
    if (e.target === ref.current) ref.current?.close();
  }

  // Window bounds — derived first so we can scope the cost query to them.
  const windowBounds = useMemo(() => {
    if (!config) return null;
    return {
      start: currentWindowStart(now, config),
      end: nextResetAfter(now, config),
    };
  }, [config, now]);

  // Pull actual token cost burned in this window from the JSONL pipeline so
  // the overage estimate is grounded in real $ instead of a hardcoded $/% guess.
  const insightsQuery = useQuery({
    queryKey: [
      'usage-window-cost',
      windowBounds?.start.toISOString(),
      windowBounds?.end.toISOString(),
    ],
    queryFn: () =>
      fetchInsights(windowBounds!.start.toISOString(), new Date().toISOString()),
    enabled: !!windowBounds,
    staleTime: 30_000,
  });
  const windowCost = insightsQuery.data?.activity.kpis.totalCost ?? 0;
  const windowTokens = insightsQuery.data?.activity.kpis.totalTokens.total ?? 0;

  const derived = useMemo(() => {
    if (!config || !windowBounds) return null;
    const { start: windowStart, end: windowEnd } = windowBounds;
    const inWindow = entries.filter((e) => {
      const t = new Date(e.timestamp);
      return t >= windowStart && t <= windowEnd;
    });
    const sorted = [...inWindow].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );
    const latest = sorted[sorted.length - 1] ?? null;
    const projection = projectHitTime(entries, windowStart, windowEnd);

    const chartPoints: { t: number; actual?: number; projected?: number }[] = [];
    for (const e of sorted) {
      chartPoints.push({ t: new Date(e.timestamp).getTime(), actual: e.percent });
    }
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

    return { windowStart, windowEnd, inWindow: sorted, projection, chartPoints, latest };
  }, [config, windowBounds, entries]);

  if (loading && !config) {
    return (
      <div className="card">
        <h3 className="card-title">Manual limit log</h3>
        <p className="card-sub">Loading…</p>
      </div>
    );
  }

  if (!config || !derived) {
    return (
      <div className="card">
        <h3 className="card-title">Manual limit log</h3>
        <p className="card-sub" style={{ color: '#d94f4f' }}>
          {error ?? 'no data'}
        </p>
      </div>
    );
  }

  const { windowStart, windowEnd, inWindow, projection, chartPoints, latest } = derived;

  const hoursTotal = 168;
  const hoursElapsed = Math.max(
    0,
    (now.getTime() - windowStart.getTime()) / 3_600_000
  );
  const projectionTone: 'good' | 'warn' | 'bad' = !projection
    ? 'good'
    : projection.eta < windowEnd
    ? 'bad'
    : 'good';

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const xTicks: number[] = [];
  for (let t = windowStartMs; t <= windowEndMs; t += 24 * 3_600_000) xTicks.push(t);

  // Overage projection: if we'll hit 100% before reset, project the actual $
  // burn in the gap. We derive $/% from real JSONL token cost in this window
  // (windowCost / latest %) — so the overage figure tracks actual model mix
  // and tool churn, not a guessed flat rate.
  const willOverage = !!projection && projection.eta < windowEnd;
  const overageHours = willOverage
    ? (windowEnd.getTime() - projection!.eta.getTime()) / 3_600_000
    : 0;
  const overagePercent = projection ? projection.slopePerHour * overageHours : 0;
  const latestPercent = latest?.percent ?? 0;
  const costPerPercent = latestPercent > 0 ? windowCost / latestPercent : 0;
  const tokensPerPercent = latestPercent > 0 ? windowTokens / latestPercent : 0;
  const overageCost = overagePercent * costPerPercent;
  const overageTokens = overagePercent * tokensPerPercent;
  const haveCostBasis = costPerPercent > 0 && latestPercent > 0;

  const dayHourFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    timeZone: APP_TIMEZONE,
  });
  const fullFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: APP_TIMEZONE,
  });
  const nowLabel = `now · ${dayHourFmt.format(now)}`;
  const resetLabel = `RESET · ${dayHourFmt.format(windowEnd)}`;

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, color: '#e8e2d6' }}>
          Manual limit log{' '}
          <span style={{ color: '#80796d', fontWeight: 400, fontSize: 11 }}>
            · window auto-resets {resetLabel.replace('RESET · ', '')} local
          </span>
        </h2>
        <button type="button" onClick={openForm} style={primaryButtonStyle}>
          + Log reading
        </button>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Projected hit"
          value={projection ? formatShort(projection.eta) : '—'}
          sub={
            projection
              ? projection.eta < windowEnd
                ? `before reset · ${formatRelativeFromNow(projection.eta, now)}`
                : `after reset · ${formatRelativeFromNow(projection.eta, now)}`
              : inWindow.length < 2
              ? 'need ≥2 entries this window'
              : 'flat or decreasing'
          }
          tone={projectionTone}
          wide
        />
        <KpiCard
          label="Slope"
          value={projection ? `+${projection.slopePerHour.toFixed(2)}%/h` : '—'}
          sub={projection ? `${(projection.slopePerHour * 24).toFixed(1)}%/day` : ''}
        />
        <KpiCard
          label="Window resets"
          value={formatRelativeFromNow(windowEnd, now)}
          sub={formatShort(windowEnd)}
        />
        <KpiCard
          label="Window elapsed"
          value={`${((hoursElapsed / hoursTotal) * 100).toFixed(0)}%`}
          sub={`${hoursElapsed.toFixed(0)}h of ${hoursTotal}h`}
        />
        <KpiCard
          label="Recent entries"
          value={String(inWindow.length)}
          sub={`${entries.length} total · click to expand`}
          onClick={() => entriesDialog.current?.showModal()}
        />
        {willOverage && (
          <KpiCard
            label="Projected overage"
            value={haveCostBasis ? `$${overageCost.toFixed(2)}` : '—'}
            sub={
              haveCostBasis
                ? `${formatTokens(overageTokens)} tokens · ${overageHours.toFixed(1)}h · @ $${costPerPercent.toFixed(2)}/%`
                : 'no cost basis yet (need ≥1 logged % + JSONL data)'
            }
            tone="bad"
          />
        )}
      </div>

      <div className="grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h3 className="card-title">Usage % across current window</h3>
          <p className="card-sub">
            Window started {formatShort(windowStart)}. Solid = logged points. Dashed = linear projection from latest. Green vertical = next reset.
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartPoints} margin={{ top: 24, right: 90, left: 0, bottom: 0 }}>
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
                label={{ value: nowLabel, position: 'top', fill: '#e8c547', fontSize: 10 }}
              />
              <ReferenceLine
                x={windowEndMs}
                stroke="#5dd66c"
                strokeWidth={2}
                label={{ value: resetLabel, position: 'top', fill: '#5dd66c', fontSize: 11, fontWeight: 600 }}
              />
              {willOverage && projection && (
                <ReferenceLine
                  x={projection.eta.getTime()}
                  stroke="#d94f4f"
                  strokeDasharray="4 3"
                  strokeWidth={2}
                  label={{
                    value: `100% · ${dayHourFmt.format(projection.eta)}`,
                    position: 'top',
                    fill: '#d94f4f',
                    fontSize: 11,
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
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="projected"
                stroke={COLORS.amber}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Log-reading modal */}
      <dialog
        ref={formDialog}
        style={dialogStyle}
        onClick={(e) => handleDialogClick(e, formDialog)}
      >
        <form onSubmit={handleSubmit} style={dialogContentStyle}>
          <h3 className="card-title" style={{ margin: 0 }}>Log a reading</h3>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Read the % from Claude Code's status display. Slash command:{' '}
            <code>/log-usage 47</code>.
          </p>
          <label style={{ fontSize: 11, color: '#80796d' }}>
            Percent (0–100)
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              required
              style={inputStyle}
              autoFocus
            />
          </label>
          <label style={{ fontSize: 11, color: '#80796d' }}>
            Note (optional)
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="e.g. after long Cabreza session"
              style={inputStyle}
            />
          </label>
          {error && <div style={{ color: '#d94f4f', fontSize: 11 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeForm} style={cancelButtonStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryButtonStyle}>
              Log reading
            </button>
          </div>
        </form>
      </dialog>

      {/* Recent-entries modal (full table) */}
      <dialog
        ref={entriesDialog}
        style={dialogStyle}
        onClick={(e) => handleDialogClick(e, entriesDialog)}
      >
        <div style={dialogContentStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              All entries this window
            </h3>
            <button
              type="button"
              onClick={() => entriesDialog.current?.close()}
              style={cancelButtonStyle}
            >
              Close
            </button>
          </div>
          <p className="card-sub" style={{ marginTop: 4 }}>
            {inWindow.length} entries between {formatShort(windowStart)} and {formatShort(windowEnd)}
          </p>
          {inWindow.length === 0 ? (
            <div className="empty">No readings yet this window.</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto', marginTop: 8 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>When</th>
                    <th style={thStyle}>%</th>
                    <th style={thStyle}>Note</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...inWindow].reverse().map((e) => (
                    <tr key={e.id}>
                      <td style={tdStyle}>{formatShort(new Date(e.timestamp))}</td>
                      <td style={tdStyle}>{e.percent}%</td>
                      <td style={{ ...tdStyle, color: '#80796d' }}>{e.note ?? ''}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          style={deleteButtonStyle}
                          aria-label="delete entry"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  background: '#14110f',
  border: '1px solid rgba(232, 226, 214, 0.15)',
  borderRadius: 3,
  color: '#e8e2d6',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '6px 8px',
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#5dd66c',
  color: '#14110f',
  border: 'none',
  borderRadius: 3,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const cancelButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: '#80796d',
  border: '1px solid rgba(232, 226, 214, 0.15)',
};

const deleteButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#80796d',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  padding: '0 6px',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  color: '#80796d',
  fontWeight: 500,
  borderBottom: '1px solid rgba(232, 226, 214, 0.07)',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  color: '#e8e2d6',
  borderBottom: '1px solid rgba(232, 226, 214, 0.05)',
};

const dialogStyle: React.CSSProperties = {
  background: '#1c1916',
  border: '1px solid rgba(232, 226, 214, 0.18)',
  borderRadius: 4,
  color: '#e8e2d6',
  padding: 0,
  minWidth: 360,
  maxWidth: 720,
};

const dialogContentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 20,
  fontFamily: 'inherit',
};

export function UsageTab({ refreshKey }: { refreshKey?: number }) {
  return <LimitLogSection refreshKey={refreshKey} />;
}
