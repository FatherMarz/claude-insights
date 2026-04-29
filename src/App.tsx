import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInsights, fetchUsageLog } from './api.ts';
import { currentWindowStart } from './lib/window.ts';
import { emptyInsights } from './lib/empty.ts';
import { Octopus } from './components/Octopus.tsx';
import { InsightsTab } from './tabs/Insights.tsx';
import { QualityTab } from './tabs/Quality.tsx';

type TabId = 'insights' | 'quality';

const RANGES = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '60d', label: '60d', days: 60 },
  { id: '90d', label: '90d', days: 90 },
  { id: '180d', label: '180d', days: 180 },
] as const;

type RangeId = (typeof RANGES)[number]['id'] | 'window';

// Tabs that consume range-filtered JSONL aggregations. Range bar shows for these only.
const RANGE_DRIVEN_TABS: TabId[] = ['insights', 'quality'];

function isoFor(daysAgo: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

function todayIso(): string {
  return new Date().toISOString();
}

export function App() {
  const [tab, setTab] = useState<TabId>('insights');
  const [rangeId, setRangeId] = useState<RangeId>('window');

  // Pull the Manual Limit Log config so the "Window" range knows when the
  // current Max-plan window started. Cached for a minute; the config rarely
  // changes and the LimitLogSection has its own poll for live data.
  const usageLogQuery = useQuery({
    queryKey: ['usage-log-config'],
    queryFn: fetchUsageLog,
    staleTime: 60_000,
  });
  const windowConfig = usageLogQuery.data?.config;

  const { from, to } = useMemo(() => {
    if (rangeId === 'window') {
      if (windowConfig) {
        const start = currentWindowStart(new Date(), windowConfig);
        return { from: start.toISOString(), to: todayIso() };
      }
      // Sensible fallback while config loads: 7 days mimics a window roughly.
      return { from: isoFor(7), to: todayIso() };
    }
    const range = RANGES.find((r) => r.id === rangeId);
    return { from: isoFor(range?.days ?? 30), to: todayIso() };
  }, [rangeId, windowConfig]);

  const query = useQuery({
    queryKey: ['insights', from, to],
    queryFn: () => fetchInsights(from, to),
  });

  const showRangeBar = RANGE_DRIVEN_TABS.includes(tab);

  // Stable empty dataset for the first paint and any re-fetch — keeps the
  // dashboard skeleton (strips, axes, cards) locked while real data loads.
  const data = useMemo(() => emptyInsights(), []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-mascot" aria-hidden="true">
          <Octopus size={48} />
        </div>
        <div className="app-header-title">
          <div className="app-title">Claude Insights</div>
          <div className="app-subtitle">Local Meta-Monitoring for Claude Code</div>
        </div>
        <button
          className="refresh-btn"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="control-row">
        <div className="filter-bar">
          <span className="filter-label">View</span>
          <button data-active={tab === 'insights'} onClick={() => setTab('insights')}>
            Insights
          </button>
          <button data-active={tab === 'quality'} onClick={() => setTab('quality')}>
            Quality
          </button>

          <span className="filter-divider" aria-hidden="true" />

          <span
            className="filter-label"
            style={{ visibility: showRangeBar ? 'visible' : 'hidden' }}
            aria-hidden={!showRangeBar}
          >
            Range
          </span>
          <button
            data-active={rangeId === 'window'}
            onClick={() => setRangeId('window')}
            tabIndex={showRangeBar ? 0 : -1}
            style={{ visibility: showRangeBar ? 'visible' : 'hidden' }}
            aria-hidden={!showRangeBar}
            title="Current Max-plan window — slides automatically at the configured reset time"
          >
            Window
          </button>
          {RANGES.map((r) => (
            <button
              key={r.id}
              data-active={rangeId === r.id}
              onClick={() => setRangeId(r.id)}
              tabIndex={showRangeBar ? 0 : -1}
              style={{ visibility: showRangeBar ? 'visible' : 'hidden' }}
              aria-hidden={!showRangeBar}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="meta-strip">
          <span>
            <strong>
              {query.data ? query.data.meta.totalAssistantMessages.toLocaleString() : '—'}
            </strong>{' '}
            assistant msgs
          </span>
          <span>
            <strong>{query.data ? query.data.meta.fileCount : '—'}</strong> files
          </span>
          <span>
            parsed in <strong>{query.data ? `${query.data.meta.elapsedMs}ms` : '—'}</strong>
          </span>
        </div>
      </div>

      {query.error && (
        <div className="error">Failed to load insights: {(query.error as Error).message}</div>
      )}
      {tab === 'insights' && (
        <InsightsTab
          activity={(query.data ?? data).activity}
          operations={(query.data ?? data).operations}
          usage={(query.data ?? data).usage}
          usageLog={usageLogQuery.data ?? null}
        />
      )}
      {tab === 'quality' && (
        <QualityTab data={(query.data ?? data).quality} facets={(query.data ?? data).facets} />
      )}
    </div>
  );
}
