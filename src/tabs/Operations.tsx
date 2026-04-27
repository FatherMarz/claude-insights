import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OperationsAggregate } from '../types.ts';

const COLORS = {
  opus: '#c4684a',
  sonnet: '#5dd66c',
  haiku: '#e8c547',
  other: '#8b8678',
  bar: '#5dd66c',
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function OperationsTab({ data }: { data: OperationsAggregate }) {
  return (
    <div className="grid">
      <div className="card">
        <h3 className="card-title">Tokens by model, daily</h3>
        <p className="card-sub">Stacked bar — input + output + cache, grouped by model tier</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.dailyTokens}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
            <YAxis stroke={AXIS_STROKE} fontSize={10} tickFormatter={formatTokens} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={labelStyle}
              itemStyle={itemStyle}
              formatter={(v: number) => formatTokens(v)}
            />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Bar dataKey="opus" stackId="a" fill={COLORS.opus} />
            <Bar dataKey="sonnet" stackId="a" fill={COLORS.sonnet} />
            <Bar dataKey="haiku" stackId="a" fill={COLORS.haiku} />
            <Bar dataKey="other" stackId="a" fill={COLORS.other} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="card-title">Sessions per project</h3>
        <p className="card-sub">Top 15 by session count</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.sessionsPerProject} layout="vertical">
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
            <YAxis
              type="category"
              dataKey="name"
              stroke={AXIS_STROKE}
              fontSize={10}
              width={140}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Bar dataKey="count" fill={COLORS.bar} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="card-title">Tool usage</h3>
        <p className="card-sub">Top 20 tools called</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data.toolUsage} layout="vertical">
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
            <YAxis
              type="category"
              dataKey="name"
              stroke={AXIS_STROKE}
              fontSize={10}
              width={140}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Bar dataKey="count" fill={COLORS.bar} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="card-title">Subagent spawns by tier</h3>
        <p className="card-sub">
          Agent calls grouped by explicit model param. "inherited" = no model specified (uses parent's).
        </p>
        {data.subagentTiers.length === 0 ? (
          <div className="empty">No subagent spawns in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.subagentTiers}
                dataKey="count"
                nameKey="tier"
                outerRadius={90}
                stroke="#14110f"
                strokeWidth={2}
                label={(entry: { tier: string; count: number }) =>
                  `${entry.tier} ${entry.count}`
                }
              >
                {data.subagentTiers.map((entry) => (
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

      <div className="card">
        <h3 className="card-title">Session length distribution</h3>
        <p className="card-sub">Surfaces context-blowup sessions</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.sessionLength}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis dataKey="bucket" stroke={AXIS_STROKE} fontSize={10} />
            <YAxis stroke={AXIS_STROKE} fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
            <Bar dataKey="count" fill={COLORS.bar} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="card-title">Top slash commands</h3>
        <p className="card-sub">Which skills are pulling weight, which are gathering dust</p>
        {data.topCommands.length === 0 ? (
          <div className="empty">No slash commands invoked in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.topCommands} layout="vertical">
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                stroke={AXIS_STROKE}
                fontSize={10}
                width={140}
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
    </div>
  );
}
