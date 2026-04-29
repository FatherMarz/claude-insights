import { useMemo } from 'react';
import type { UsageLogFile } from '../types.ts';
import { currentWindowStart, nextResetAfter } from '../lib/window.ts';
import { summarizeWindow } from '../lib/projection.ts';

function formatRel(d: Date, now: Date): string {
  const diffMs = d.getTime() - now.getTime();
  const sign = diffMs >= 0 ? 'in ' : '';
  const past = diffMs < 0 ? ' ago' : '';
  const abs = Math.abs(diffMs);
  const hours = abs / 3_600_000;
  if (hours < 1) return `${sign}${Math.round(abs / 60_000)}m${past}`;
  if (hours < 36) return `${sign}${hours.toFixed(1)}h${past}`;
  return `${sign}${Math.round(hours / 24)}d${past}`;
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const classes = ['stat-cell'];
  if (tone) classes.push(`stat-cell--${tone}`);
  return (
    <div className={classes.join(' ')}>
      <div className="stat-cell-text">
        <div className="stat-cell-label">{label}</div>
        {sub && <div className="stat-cell-sub">{sub}</div>}
      </div>
      <div className="stat-cell-value">{value}</div>
    </div>
  );
}

function pctTone(pct: number): 'good' | 'warn' | 'bad' {
  if (pct >= 85) return 'bad';
  if (pct >= 65) return 'warn';
  return 'good';
}

interface Props {
  usageLog: UsageLogFile | null;
}

// Live per-window status — Current %, Peak, Window resets, Projected hit.
// Renders even when usageLog is missing (em-dash placeholders) so layout is
// stable across initial load.
export function WindowStatusStrip({ usageLog }: Props) {
  const now = useMemo(() => new Date(), [usageLog]);
  const summary = useMemo(() => {
    if (!usageLog) return null;
    const start = currentWindowStart(now, usageLog.config);
    const end = nextResetAfter(start, usageLog.config);
    return { start, end, ...summarizeWindow(usageLog.entries, start, end) };
  }, [usageLog, now]);

  const willOverage =
    !!summary?.projection && summary.projection.eta < summary.end;
  const projectedHitTone: 'good' | 'warn' | 'bad' | undefined = !summary?.projection
    ? undefined
    : willOverage
    ? 'bad'
    : 'good';

  return (
    <div className="stat-strip stat-strip--status stat-strip--prominent">
      <Cell
        label="Current %"
        value={summary?.latest != null ? `${summary.latest.percent.toFixed(0)}%` : '—'}
        sub={
          summary?.latest
            ? formatRel(new Date(summary.latest.timestamp), now)
            : usageLog
            ? 'no readings yet'
            : 'loading…'
        }
        tone={summary?.latest != null ? pctTone(summary.latest.percent) : undefined}
      />
      <Cell
        label="Peak this window"
        value={summary && summary.count > 0 ? `${summary.peak.toFixed(0)}%` : '—'}
        sub={summary ? `${summary.count} reading${summary.count === 1 ? '' : 's'}` : '—'}
        tone={summary && summary.count > 0 ? pctTone(summary.peak) : undefined}
      />
      <Cell
        label="Window resets"
        value={summary ? formatRel(summary.end, now) : '—'}
        sub={
          summary
            ? summary.end.toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
              })
            : '—'
        }
      />
      <Cell
        label="Projected hit"
        value={
          summary?.projection
            ? summary.projection.eta.toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
              })
            : '—'
        }
        sub={
          summary?.projection
            ? willOverage
              ? `before reset · ${formatRel(summary.projection.eta, now)}`
              : 'after reset · safe'
            : summary && summary.count < 2
            ? 'need ≥2 readings'
            : summary
            ? 'flat or decreasing'
            : '—'
        }
        tone={projectedHitTone}
      />
    </div>
  );
}
