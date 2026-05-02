import { PROJECTION_ALGORITHMS } from '../lib/projection.ts';

interface LegendItem {
  label: string;
  color: string;
  dashArray?: string;
  strokeWidth?: number;
  showDot?: boolean;
  title?: string;
}

const SERIES: LegendItem[] = [
  { label: 'Readings', color: '#5dd66c', strokeWidth: 2, showDot: true },
  { label: 'Credit overage', color: '#c4684a', strokeWidth: 2, showDot: true },
  { label: 'Next reset', color: '#5dd66c', strokeWidth: 3 },
  { label: 'Now', color: '#e8c547', strokeWidth: 2, dashArray: '4 3' },
  { label: '100% limit', color: '#d94f4f', strokeWidth: 2, dashArray: '1 2' },
  { label: 'Projected 100% ETA', color: '#d94f4f', strokeWidth: 2, dashArray: '4 3' },
];

export function ChartLegend() {
  const projectionItems: LegendItem[] = PROJECTION_ALGORITHMS.map((a) => ({
    label: a.label,
    color: a.color,
    dashArray: a.dashArray,
    strokeWidth: a.strokeWidth,
    title: a.describe,
  }));

  return (
    <div className="chart-legend">
      <div className="chart-legend-group">
        <span className="chart-legend-title">Series</span>
        {SERIES.map((item) => (
          <LegendChip key={item.label} item={item} />
        ))}
      </div>
      <div className="chart-legend-group">
        <span className="chart-legend-title">Projection algos</span>
        {projectionItems.map((item) => (
          <LegendChip key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}

function LegendChip({ item }: { item: LegendItem }) {
  return (
    <span className="chart-legend-item" title={item.title ?? item.label}>
      <Swatch
        color={item.color}
        dashArray={item.dashArray}
        strokeWidth={item.strokeWidth ?? 2}
        showDot={item.showDot}
      />
      <span>{item.label}</span>
    </span>
  );
}

function Swatch({
  color,
  dashArray,
  strokeWidth,
  showDot,
}: {
  color: string;
  dashArray?: string;
  strokeWidth: number;
  showDot?: boolean;
}) {
  return (
    <svg
      className="chart-legend-swatch"
      width="28"
      height="8"
      viewBox="0 0 28 8"
      aria-hidden
    >
      <line
        x1="0"
        y1="4"
        x2="28"
        y2="4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
      {showDot && <circle cx="14" cy="4" r="2.5" fill={color} />}
    </svg>
  );
}
