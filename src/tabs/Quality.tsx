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
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyRatio, FacetsAggregate, QualityAggregate } from '../types.ts';

interface Band {
  good: [number, number];
  warn: [number, number];
  bad: [number, number];
}

const GRID_STROKE = 'rgba(232, 226, 214, 0.07)';
const AXIS_STROKE = '#80796d';
const LINE_STROKE = '#5dd66c';

const BAND_COLORS = {
  good: 'rgba(93, 214, 108, 0.10)',
  warn: 'rgba(244, 166, 39, 0.10)',
  bad: 'rgba(217, 79, 79, 0.10)',
};

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

const CHART_H = 210;
const FACET_CHART_H = 260;

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-cell">
      <div className="stat-cell-label">{label}</div>
      <div className="stat-cell-value">{value}</div>
      {sub && <div className="stat-cell-sub">{sub}</div>}
    </div>
  );
}

// Window weighted average for a daily ratio series — sum(numerator)/sum(denominator).
function windowRatio(series: DailyRatio[], scale = 1): { value: number; den: number } {
  let num = 0;
  let den = 0;
  for (const d of series) {
    num += d.numerator;
    den += d.denominator;
  }
  return { value: den > 0 ? (num / den) * scale : 0, den };
}

interface ChartProps {
  title: string;
  sub: string;
  series: DailyRatio[];
  format?: (v: number) => string;
  bands?: Band;
}

function QualityChart({ title, sub, series, format = (v) => v.toFixed(2), bands }: ChartProps) {
  const empty = series.every((d) => d.denominator === 0);
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <p className="card-sub">{sub}</p>
      {empty ? (
        <div className="empty">No data in this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={CHART_H}>
          <LineChart data={series}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />
            <XAxis dataKey="date" stroke={AXIS_STROKE} fontSize={10} />
            <YAxis stroke={AXIS_STROKE} fontSize={10} tickFormatter={format} />
            {bands && (
              <>
                <ReferenceArea
                  y1={bands.good[0]}
                  y2={bands.good[1]}
                  fill={BAND_COLORS.good}
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  y1={bands.warn[0]}
                  y2={bands.warn[1]}
                  fill={BAND_COLORS.warn}
                  ifOverflow="extendDomain"
                />
                <ReferenceArea
                  y1={bands.bad[0]}
                  y2={bands.bad[1]}
                  fill={BAND_COLORS.bad}
                  ifOverflow="extendDomain"
                />
              </>
            )}
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={labelStyle}
              itemStyle={itemStyle}
              formatter={(v: number) => format(v)}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_STROKE}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: LINE_STROKE, stroke: '#14110f', strokeWidth: 1.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

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

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

export function QualityTab({
  data,
  facets,
}: {
  data: QualityAggregate;
  facets: FacetsAggregate;
}) {
  const readEdit = windowRatio(data.readEditRatio);
  const reasoning = windowRatio(data.reasoningLoopsPer1K, 1000);
  const writeShare = windowRatio(data.writeShare);
  const redaction = windowRatio(data.thinkingRedactionRate);
  const apiPerUser = windowRatio(data.apiTurnsPerUserTurn);
  const tokensPerUser = windowRatio(data.tokensPerUserTurn);
  const fully = facets.outcomes.find((o) => o.name === 'fully_achieved')?.count ?? 0;
  const mostly = facets.outcomes.find((o) => o.name === 'mostly_achieved')?.count ?? 0;
  const outcomeRate =
    facets.totalSessionsAssessed > 0
      ? ((fully + mostly) / facets.totalSessionsAssessed) * 100
      : 0;
  const topFriction = facets.topFriction[0];
  const totalFriction = facets.topFriction.reduce((s, f) => s + f.count, 0);
  const frictionPerSession =
    facets.totalSessionsAssessed > 0 ? totalFriction / facets.totalSessionsAssessed : 0;

  return (
    <>
      <div className="stat-strip">
        <StatCell
          label="Outcome rate"
          value={facets.totalSessionsAssessed > 0 ? `${outcomeRate.toFixed(0)}%` : '—'}
          sub="achieved sessions"
        />
        <StatCell
          label="Sessions assessed"
          value={facets.totalSessionsAssessed.toLocaleString()}
          sub={`of ${facets.totalSessionsInRange.toLocaleString()}`}
        />
        <StatCell
          label="Read : Edit"
          value={readEdit.den > 0 ? readEdit.value.toFixed(2) : '—'}
          sub="weighted"
        />
        <StatCell
          label="Reasoning / 1K"
          value={reasoning.den > 0 ? reasoning.value.toFixed(1) : '—'}
          sub="loops per 1K calls"
        />
        <StatCell
          label="Write share"
          value={writeShare.den > 0 ? `${(writeShare.value * 100).toFixed(0)}%` : '—'}
          sub="of mutations"
        />
        <StatCell
          label="Redaction"
          value={redaction.den > 0 ? `${(redaction.value * 100).toFixed(0)}%` : '—'}
          sub="thinking blocks"
        />
        <StatCell
          label="API : user"
          value={apiPerUser.den > 0 ? apiPerUser.value.toFixed(1) : '—'}
          sub="turns per prompt"
        />
        <StatCell
          label="Tokens / prompt"
          value={
            tokensPerUser.den > 0
              ? tokensPerUser.value >= 1_000_000
                ? `${(tokensPerUser.value / 1_000_000).toFixed(1)}M`
                : `${(tokensPerUser.value / 1_000).toFixed(0)}K`
              : '—'
          }
          sub="per user turn"
        />
        <StatCell
          label="Friction / session"
          value={
            facets.totalSessionsAssessed > 0 ? frictionPerSession.toFixed(1) : '—'
          }
          sub={topFriction ? `top: ${topFriction.name.replace(/_/g, ' ')}` : 'no friction'}
        />
      </div>

      <div className="grid grid-3col">
        <QualityChart
          title="Read : Edit ratio"
        sub="File reads per edit. Higher = more investigation before mutation. Drift signal if trending down."
        series={data.readEditRatio}
        format={(v) => v.toFixed(2)}
        bands={{ good: [3, 100], warn: [1.5, 3], bad: [0, 1.5] }}
      />

      <QualityChart
        title="Reasoning loops / 1K tool calls"
        sub='Phrases like "let me try again", "actually,", "wait,". Lower is better.'
        series={data.reasoningLoopsPer1K}
        format={(v) => v.toFixed(1)}
        bands={{ good: [0, 5], warn: [5, 15], bad: [15, 1000] }}
      />

      <QualityChart
        title="Write share of mutations"
        sub="Write / (Edit + Write). High = rewriting files instead of surgical edits."
        series={data.writeShare}
        format={(v) => `${(v * 100).toFixed(0)}%`}
        bands={{ good: [0, 0.25], warn: [0.25, 0.5], bad: [0.5, 1] }}
      />

      <QualityChart
        title="Thinking redaction rate"
        sub="Fraction of thinking blocks that are redacted. Captures model-behavior shifts."
        series={data.thinkingRedactionRate}
        format={(v) => `${(v * 100).toFixed(0)}%`}
      />

      <QualityChart
        title="API turns per user turn"
        sub="Assistant messages per user message. Tool-call density + reasoning depth."
        series={data.apiTurnsPerUserTurn}
        format={(v) => v.toFixed(1)}
      />

      <QualityChart
        title="Tokens per user turn"
        sub="Total tokens / user message. Cost-per-prompt proxy."
        series={data.tokensPerUserTurn}
        format={(v) =>
          v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`
        }
      />

      <div className="card">
        <h3 className="card-title">Session outcomes</h3>
        <p className="card-sub">
          From `~/.claude/usage-data/facets/` · {facets.totalSessionsAssessed}/
          {facets.totalSessionsInRange} sessions assessed. Run /claude-activity to backfill.
        </p>
        {facets.outcomes.length === 0 ? (
          <div className="empty">No outcomes assessed in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={FACET_CHART_H}>
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
          <ResponsiveContainer width="100%" height={FACET_CHART_H}>
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
                    fill={HELPFULNESS_COLORS[entry.name] ?? '#5dd66c'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Top friction reasons</h3>
        <p className="card-sub">Where sessions stumbled · aggregated from facets friction_counts</p>
        {facets.topFriction.length === 0 ? (
          <div className="empty">No friction logged in this range.</div>
        ) : (
          <ResponsiveContainer width="100%" height={FACET_CHART_H}>
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
              <Bar dataKey="count" fill="#c4684a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      </div>
    </>
  );
}
