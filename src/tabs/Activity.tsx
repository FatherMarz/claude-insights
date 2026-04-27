import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActivityAggregate } from '../types.ts';

const COLORS = {
  opus: '#c4684a',
  sonnet: '#5dd66c',
  haiku: '#e8c547',
  other: '#8b8678',
  bar: '#5dd66c',
};

const TOKEN_PIE_COLORS = ['#80796d', '#c4684a', '#5dd66c', '#e8c547'];

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

function formatNumber(n: number): string {
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

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function ActivityTab({ data }: { data: ActivityAggregate }) {
  const { kpis } = data;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Sessions" value={kpis.sessions.toLocaleString()} />
        <KpiCard
          label="Active hours"
          value={kpis.activeHours.toFixed(1)}
          sub="< 30min idle gaps"
        />
        <KpiCard label="Total tokens" value={formatNumber(kpis.totalTokens.total)} />
        <KpiCard label="Tool calls" value={kpis.toolCalls.toLocaleString()} />
        <KpiCard
          label="Median response"
          value={formatDuration(kpis.medianResponseTimeSec)}
          sub={`avg ${formatDuration(kpis.avgResponseTimeSec)}`}
        />
        <KpiCard
          label="Est. cost"
          value={formatCost(kpis.totalCost)}
          sub="public API rates"
        />
      </div>

      <div className="grid">
        <div className="card">
          <h3 className="card-title">Hour-of-day activity</h3>
          <p className="card-sub">When in the day work happens (UTC, assistant messages)</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.hourDistribution}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis
                dataKey="hour"
                stroke={AXIS_STROKE}
                fontSize={10}
                tickFormatter={(h) => `${h}:00`}
              />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                labelFormatter={(h: number) => `${h}:00 UTC`}
              />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Sessions per day</h3>
          <p className="card-sub">By session start date</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.sessionsPerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
              />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Estimated cost per day, by model</h3>
          <p className="card-sub">USD, public API rates. Max-plan actual is fixed-bucket.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.costPerDay}>
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
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="opus" stackId="a" fill={COLORS.opus} />
              <Bar dataKey="sonnet" stackId="a" fill={COLORS.sonnet} />
              <Bar dataKey="haiku" stackId="a" fill={COLORS.haiku} />
              <Bar dataKey="other" stackId="a" fill={COLORS.other} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Token breakdown</h3>
          <p className="card-sub">
            Where the tokens go — cache reads dominate when prompt caching works
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data.tokenBreakdown}
                dataKey="value"
                nameKey="name"
                outerRadius={80}
                stroke="#14110f"
                strokeWidth={2}
                label={false}
              >
                {data.tokenBreakdown.map((_, idx) => (
                  <Cell key={idx} fill={TOKEN_PIE_COLORS[idx % TOKEN_PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                formatter={(v: number, name: string) => [
                  `${formatNumber(v)} (${((v / data.kpis.totalTokens.total) * 100).toFixed(1)}%)`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Response time per day</h3>
          <p className="card-sub">
            Time from your message → next assistant message. Median + average.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.responseTimePerDay}>
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
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
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
      </div>
    </>
  );
}
