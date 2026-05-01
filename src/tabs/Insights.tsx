import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ActivityAggregate,
  CreditLogEntry,
  OperationsAggregate,
  UsageAggregate,
  UsageLogFile,
} from '../types.ts';
import { timezoneLabel } from '../lib/window.ts';
import { WindowChart } from '../components/WindowChart.tsx';
import { WindowStatusStrip } from '../components/WindowStatusStrip.tsx';
import { LogReadingButton } from '../components/LogReadingButton.tsx';

const COLORS = {
  opus: '#c4684a',
  sonnet: '#5dd66c',
  haiku: '#e8c547',
  other: '#8b8678',
  bar: '#5dd66c',
  copper: '#c4684a',
  amber: '#f4a627',
  canary: '#e8c547',
};

const TIER_COLORS: Record<string, string> = {
  opus: COLORS.opus,
  sonnet: COLORS.sonnet,
  haiku: COLORS.haiku,
  other: COLORS.other,
  inherited: '#5a5447',
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

const CHART_H = 170;

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-cell">
      <div className="stat-cell-label">{label}</div>
      <div className="stat-cell-value">{value}</div>
      {sub && <div className="stat-cell-sub">{sub}</div>}
    </div>
  );
}

interface InsightsProps {
  activity: ActivityAggregate;
  operations: OperationsAggregate;
  usage: UsageAggregate;
  usageLog: UsageLogFile | null;
  creditTotal: number;
  windowCreditEntries: CreditLogEntry[];
  anchorDollars: number | null;
  firstHundredAt: string | null;
  truePercent: number | null;
  now: Date;
}

export function InsightsTab({
  activity,
  operations,
  usage,
  usageLog,
  creditTotal,
  windowCreditEntries,
  anchorDollars,
  firstHundredAt,
  truePercent,
  now,
}: InsightsProps) {
  const { kpis } = activity;
  const totalPrompts = useMemo(
    () => operations.dailyTokens.reduce((sum, d) => sum + (d.prompts ?? 0), 0),
    [operations.dailyTokens]
  );

  const latestPercent = useMemo(() => {
    const entries = usageLog?.entries ?? [];
    if (entries.length === 0) return null;
    const last = entries.reduce((latest, e) =>
      e.timestamp > latest.timestamp ? e : latest
    );
    return last.percent;
  }, [usageLog]);

  return (
    <>
      <div className="stat-strip">
        <StatCell label="Sessions" value={kpis.sessions.toLocaleString()} />
        <StatCell label="Prompts" value={totalPrompts.toLocaleString()} />
        <StatCell
          label="Your time"
          value={`${kpis.userTimeHours.toFixed(1)}h`}
          sub="directing"
        />
        <StatCell
          label="Claude's time"
          value={`${kpis.claudeTimeHours.toFixed(1)}h`}
          sub={(() => {
            const total = kpis.userTimeHours + kpis.claudeTimeHours;
            const pct = total > 0 ? (kpis.claudeTimeHours / total) * 100 : 0;
            return `${pct.toFixed(0)}% autonomous`;
          })()}
        />
        <StatCell
          label="Leverage"
          value={`${kpis.userTimeHours > 0 ? (kpis.claudeTimeHours / kpis.userTimeHours).toFixed(1) : '—'}x`}
          sub="Claude / you"
        />
        <StatCell label="Tool calls" value={kpis.toolCalls.toLocaleString()} />
        <StatCell label="Tokens" value={formatTokens(kpis.totalTokens.total)} />
        <StatCell
          label="Est. cost"
          value={formatCost(kpis.totalCost)}
          sub="API rates"
        />
        <StatCell
          label="Credits"
          value={formatCost(creditTotal)}
          sub="this range"
        />
        <StatCell
          label="True %"
          value={truePercent != null ? `${truePercent.toFixed(0)}%` : '—'}
          sub={
            anchorDollars != null
              ? `100% ≈ ${formatCost(anchorDollars)}`
              : firstHundredAt
                ? 'no anchor yet'
                : 'pre-100%'
          }
        />
        <StatCell
          label="Median resp"
          value={formatDuration(kpis.medianResponseTimeSec)}
          sub={`avg ${formatDuration(kpis.avgResponseTimeSec)}`}
        />
        <StatCell
          label="Avg block"
          value={`${usage.kpis.avgBlockPrompts.toFixed(1)}`}
          sub={`${usage.kpis.totalBlocks} blocks`}
        />
      </div>

      <div className="grid grid-4col">
        <div className="card">
          <h3 className="card-title">Tokens by model, daily</h3>
          <p className="card-sub">Stacked tokens · line = prompts (right axis)</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <ComposedChart data={operations.dailyTokens}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                yAxisId="tokens"
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={formatTokens}
              />
              <YAxis
                yAxisId="prompts"
                orientation="right"
                stroke={AXIS_STROKE}
                fontSize={10}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                formatter={(v: number, name: string) =>
                  name === 'prompts' ? String(v) : formatTokens(v)
                }
              />
              <Bar yAxisId="tokens" dataKey="opus" stackId="a" fill={COLORS.opus} />
              <Bar yAxisId="tokens" dataKey="sonnet" stackId="a" fill={COLORS.sonnet} />
              <Bar yAxisId="tokens" dataKey="haiku" stackId="a" fill={COLORS.haiku} />
              <Bar yAxisId="tokens" dataKey="other" stackId="a" fill={COLORS.other} />
              <Line
                yAxisId="prompts"
                type="monotone"
                dataKey="prompts"
                stroke="#e8e2d6"
                strokeWidth={2}
                dot={{ r: 2, fill: '#e8e2d6' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Cost per day, by model</h3>
          <p className="card-sub">USD, public API rates</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={activity.costPerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                formatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Bar dataKey="opus" stackId="a" fill={COLORS.opus} />
              <Bar dataKey="sonnet" stackId="a" fill={COLORS.sonnet} />
              <Bar dataKey="haiku" stackId="a" fill={COLORS.haiku} />
              <Bar dataKey="other" stackId="a" fill={COLORS.other} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Your time vs Claude's time, daily</h3>
          <p className="card-sub">Hours per day · capped 30min idle gaps</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={activity.timeSplitPerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(v: number) => `${v.toFixed(1)}h`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                formatter={(v: number) => `${v.toFixed(2)}h`}
              />
              <Bar dataKey="userHours" name="you" stackId="a" fill={COLORS.amber} />
              <Bar dataKey="claudeHours" name="claude" stackId="a" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Hour-of-day activity</h3>
          <p className="card-sub">{timezoneLabel()} · assistant messages</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={activity.hourDistribution}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis
                dataKey="hour"
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(h) => `${h}`}
              />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                labelFormatter={(h: number) => `${h}:00 ${timezoneLabel()}`}
              />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Sessions per project</h3>
          <p className="card-sub">Top 15 by session count</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={operations.sessionsPerProject} layout="vertical">
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                stroke={AXIS_STROKE}
                fontSize={10}
                width={130}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Tool usage</h3>
          <p className="card-sub">Top 20 tools called</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={operations.toolUsage} layout="vertical">
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                stroke={AXIS_STROKE}
                fontSize={10}
                width={130}
              />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Top slash commands</h3>
          <p className="card-sub">Skills pulling weight vs. gathering dust</p>
          {operations.topCommands.length === 0 ? (
            <div className="empty">No slash commands invoked.</div>
          ) : (
            <ResponsiveContainer width="100%" height={CHART_H}>
              <BarChart data={operations.topCommands} layout="vertical">
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
                <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={AXIS_STROKE}
                  fontSize={10}
                  width={130}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  itemStyle={itemStyle}
                />
                <Bar dataKey="count" fill={COLORS.bar} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Blocks per day</h3>
          <p className="card-sub">Distinct 5h Max-plan windows opened per day</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={usage.blocksPerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details className="collapsible-row">
        <summary>More charts</summary>
        <div className="grid grid-4col">
        <div className="card">
          <h3 className="card-title">Response time per day</h3>
          <p className="card-sub">User msg → next assistant msg</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <LineChart data={activity.responseTimePerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(v: number) => formatDuration(v)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                formatter={(v: number) => formatDuration(v)}
              />
              <Line
                type="monotone"
                dataKey="medianSec"
                name="median"
                stroke="#5dd66c"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="avgSec"
                name="avg"
                stroke="#f4a627"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Session length</h3>
          <p className="card-sub">Surfaces context-blowup sessions</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={operations.sessionLength}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="bucket" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">5h block size distribution</h3>
          <p className="card-sub">Prompts per Max-plan reset window. Right tail = soft-cap risk.</p>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={usage.blockSizeDistribution}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="bucket" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count">
                {usage.blockSizeDistribution.map((b) => (
                  <Cell
                    key={b.bucket}
                    fill={
                      b.minPrompts >= 51
                        ? COLORS.amber
                        : b.minPrompts >= 16
                        ? COLORS.canary
                        : COLORS.bar
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Subagent spawns by tier</h3>
          <p className="card-sub">"inherited" = no model param (uses parent's)</p>
          {operations.subagentTiers.length === 0 ? (
            <div className="empty">No subagent spawns.</div>
          ) : (
            <ResponsiveContainer width="100%" height={CHART_H}>
              <PieChart>
                <Pie
                  data={operations.subagentTiers}
                  dataKey="count"
                  nameKey="tier"
                  outerRadius={65}
                  innerRadius={30}
                  stroke="#14110f"
                  strokeWidth={2}
                  label={(entry: { tier: string; count: number }) =>
                    `${entry.tier} ${entry.count}`
                  }
                >
                  {operations.subagentTiers.map((entry) => (
                    <Cell key={entry.tier} fill={TIER_COLORS[entry.tier] ?? COLORS.other} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  itemStyle={itemStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        </div>
      </details>

      <WindowStatusStrip usageLog={usageLog} now={now} />

      <div className="card window-card">
        <div className="window-card-header">
          <div>
            <h3 className="card-title">Usage % across current window</h3>
            <p className="card-sub">
              Solid green = readings · dashed amber = projection · copper = credit-derived overage · green = next reset · red = projected 100%
            </p>
          </div>
          <LogReadingButton latestPercent={latestPercent} />
        </div>
        <WindowChart
          usageLog={usageLog}
          height={200}
          now={now}
          creditEntries={windowCreditEntries}
          anchorDollars={anchorDollars}
          firstHundredAt={firstHundredAt}
        />
      </div>
    </>
  );
}
