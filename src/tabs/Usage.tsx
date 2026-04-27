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
import type { FacetsAggregate, UsageAggregate } from '../types.ts';

const COLORS = {
  bar: '#5dd66c',
  copper: '#c4684a',
  amber: '#f4a627',
  canary: '#e8c547',
  muted: '#8b8678',
};

const OUTCOME_COLORS: Record<string, string> = {
  fully_achieved: '#5dd66c',
  mostly_achieved: '#a3d65d',
  partially_achieved: '#e8c547',
  not_achieved: '#d94f4f',
};

const HELPFULNESS_COLORS: Record<string, string> = {
  essential: '#5dd66c',
  very_helpful: '#a3d65d',
  helpful: '#e8c547',
  unhelpful: '#d94f4f',
  not_helpful: '#d94f4f',
};

const FACET_FALLBACK = ['#5dd66c', '#c4684a', '#e8c547', '#8b8678', '#f4a627', '#a86a4d'];

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

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const colorMap: Record<string, string> = {
    good: '#5dd66c',
    warn: '#f4a627',
    bad: '#d94f4f',
    neutral: '#e8e2d6',
  };
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: colorMap[tone ?? 'neutral'] }}>
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function UsageTab({
  usage,
  facets,
}: {
  usage: UsageAggregate;
  facets: FacetsAggregate;
}) {
  const { kpis } = usage;
  const deltaSign = kpis.weekDeltaPct > 0 ? '+' : '';
  const deltaTone: 'good' | 'warn' | 'neutral' =
    Math.abs(kpis.weekDeltaPct) < 5 ? 'neutral' : kpis.weekDeltaPct > 0 ? 'warn' : 'good';

  const activeBlockTone: 'good' | 'warn' | 'bad' =
    kpis.activeBlock == null
      ? 'good'
      : kpis.activeBlock.expiresInMin < 60
      ? 'warn'
      : kpis.activeBlock.prompts > 60
      ? 'warn'
      : 'good';

  return (
    <>
      <div className="kpi-grid">
        <KpiCard
          label="Prompts this week"
          value={kpis.promptsThisWeek.toLocaleString()}
          sub={`vs ${kpis.promptsLastWeek.toLocaleString()} last week`}
        />
        <KpiCard
          label="Week-over-week"
          value={`${deltaSign}${kpis.weekDeltaPct.toFixed(0)}%`}
          tone={deltaTone}
        />
        <KpiCard
          label="Avg block size"
          value={`${kpis.avgBlockPrompts.toFixed(1)}`}
          sub="prompts per 5h block"
        />
        <KpiCard
          label="Avg block duration"
          value={`${kpis.avgBlockDurationMin.toFixed(0)}m`}
          sub={`${kpis.totalBlocks.toLocaleString()} total blocks`}
        />
        <KpiCard
          label="Active block"
          value={
            kpis.activeBlock
              ? `${kpis.activeBlock.prompts}`
              : '—'
          }
          sub={
            kpis.activeBlock
              ? `${Math.round(kpis.activeBlock.expiresInMin)}m left`
              : 'no active 5h window'
          }
          tone={activeBlockTone}
        />
        <KpiCard
          label="Outcome rate"
          value={
            facets.totalSessionsAssessed > 0
              ? `${(((facets.outcomes.find((o) => o.name === 'fully_achieved')?.count ?? 0) /
                  facets.totalSessionsAssessed) *
                  100
                ).toFixed(0)}%`
              : '—'
          }
          sub={`${facets.totalSessionsAssessed}/${facets.totalSessionsInRange} assessed`}
        />
      </div>

      <div className="grid">
        <div className="card">
          <h3 className="card-title">Prompts per week</h3>
          <p className="card-sub">User messages per ISO week. The /usage weekly bucket equivalent.</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={usage.weeklyPrompts}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="weekStart" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={labelStyle}
                itemStyle={itemStyle}
                labelFormatter={(v: string) => `Week of ${v}`}
              />
              <Bar dataKey="prompts" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">5h block size distribution</h3>
          <p className="card-sub">Prompts per Max-plan reset window. The right tail = soft-cap risk.</p>
          <ResponsiveContainer width="100%" height={240}>
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
          <h3 className="card-title">Blocks per day</h3>
          <p className="card-sub">Number of distinct 5h Max-plan windows opened per day</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={usage.blocksPerDay}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
              <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
              <YAxis stroke={AXIS_STROKE} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
              <Bar dataKey="count" fill={COLORS.bar} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="card-title">Session outcomes</h3>
          <p className="card-sub">
            From `~/.claude/usage-data/facets/`. Run /claude-activity to backfill recent sessions.
          </p>
          {facets.outcomes.length === 0 ? (
            <div className="empty">No outcomes assessed in this range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={facets.outcomes}
                  dataKey="count"
                  nameKey="name"
                  outerRadius={80}
                  innerRadius={45}
                  stroke="#14110f"
                  strokeWidth={2}
                  label={false}
                >
                  {facets.outcomes.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={OUTCOME_COLORS[entry.name] ?? FACET_FALLBACK[i % FACET_FALLBACK.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  itemStyle={itemStyle}
                  formatter={(v: number, name: string) => [v, formatLabel(name)]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                  formatter={(value: string) => formatLabel(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Helpfulness distribution</h3>
          <p className="card-sub">How useful Claude was per session</p>
          {facets.helpfulness.length === 0 ? (
            <div className="empty">No helpfulness data in this range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={facets.helpfulness} layout="vertical">
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
                <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={AXIS_STROKE}
                  fontSize={10}
                  width={120}
                  tickFormatter={formatLabel}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  itemStyle={itemStyle}
                  labelFormatter={formatLabel}
                />
                <Bar dataKey="count">
                  {facets.helpfulness.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={HELPFULNESS_COLORS[entry.name] ?? COLORS.bar}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Top friction reasons</h3>
          <p className="card-sub">Where sessions stumbled. Aggregated from facets friction_counts.</p>
          {facets.topFriction.length === 0 ? (
            <div className="empty">No friction logged in this range.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={facets.topFriction} layout="vertical">
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
                <XAxis type="number" stroke={AXIS_STROKE} fontSize={10} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke={AXIS_STROKE}
                  fontSize={10}
                  width={170}
                  tickFormatter={formatLabel}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={labelStyle}
                  itemStyle={itemStyle}
                  labelFormatter={formatLabel}
                />
                <Bar dataKey="count" fill={COLORS.copper} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
