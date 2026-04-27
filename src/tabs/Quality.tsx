import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyRatio, QualityAggregate } from '../types.ts';

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
        <ResponsiveContainer width="100%" height={240}>
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

export function QualityTab({ data }: { data: QualityAggregate }) {
  return (
    <div className="grid">
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
    </div>
  );
}
