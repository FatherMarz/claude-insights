import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInsights, fetchUsageLog } from './api.ts';
import { currentWindowStart } from './lib/window.ts';
import { OperationsTab } from './tabs/Operations.tsx';
import { QualityTab } from './tabs/Quality.tsx';
import { ActivityTab } from './tabs/Activity.tsx';
import { UsageTab } from './tabs/Usage.tsx';
import { HistoryTab } from './tabs/History.tsx';

type TabId = 'usage' | 'operations' | 'quality' | 'activity' | 'history';

const RANGES = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '60d', label: '60d', days: 60 },
  { id: '90d', label: '90d', days: 90 },
  { id: '180d', label: '180d', days: 180 },
] as const;

type RangeId = (typeof RANGES)[number]['id'] | 'window';

// Tabs that consume range-filtered JSONL aggregations. Range bar shows for these only.
const RANGE_DRIVEN_TABS: TabId[] = ['operations', 'quality', 'activity', 'history'];

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
  const [tab, setTab] = useState<TabId>('usage');
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

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="app-title">Claude Insights</div>
          <div className="app-subtitle">Local meta-monitoring for Claude Code</div>
        </div>
        <button onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div className="tabs">
          <button
            className="tab"
            data-active={tab === 'usage'}
            onClick={() => setTab('usage')}
          >
            Usage
          </button>
          <button
            className="tab"
            data-active={tab === 'activity'}
            onClick={() => setTab('activity')}
          >
            Activity
          </button>
          <button
            className="tab"
            data-active={tab === 'operations'}
            onClick={() => setTab('operations')}
          >
            Operations
          </button>
          <button
            className="tab"
            data-active={tab === 'history'}
            onClick={() => setTab('history')}
          >
            History
          </button>
          <button
            className="tab"
            data-active={tab === 'quality'}
            onClick={() => setTab('quality')}
          >
            Quality
          </button>
        </div>

        {/* visibility:hidden (not display:none) keeps the row height stable when
            switching to tabs that don't use the range — prevents content shift. */}
        <div
          className="filter-bar"
          style={{ visibility: showRangeBar ? 'visible' : 'hidden' }}
          aria-hidden={!showRangeBar}
        >
          <span className="filter-label">Range</span>
          <button
            data-active={rangeId === 'window'}
            onClick={() => setRangeId('window')}
            tabIndex={showRangeBar ? 0 : -1}
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
            >
              {r.label}
            </button>
          ))}
          {query.data && (
            <div className="meta-strip">
              <span>
                <strong>{query.data.meta.totalAssistantMessages.toLocaleString()}</strong> assistant
                msgs
              </span>
              <span>
                <strong>{query.data.meta.fileCount}</strong> files
              </span>
              <span>
                parsed in <strong>{query.data.meta.elapsedMs}ms</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {tab === 'usage' && <UsageTab refreshKey={query.dataUpdatedAt} />}

      {query.isLoading && tab !== 'usage' && <div className="loading">Parsing JSONL files…</div>}
      {query.error && tab !== 'usage' && (
        <div className="error">Failed to load insights: {(query.error as Error).message}</div>
      )}
      {query.data && tab === 'operations' && <OperationsTab data={query.data.operations} />}
      {query.data && tab === 'quality' && <QualityTab data={query.data.quality} />}
      {query.data && tab === 'activity' && <ActivityTab data={query.data.activity} />}
      {query.data && tab === 'history' && (
        <HistoryTab usage={query.data.usage} facets={query.data.facets} />
      )}
    </div>
  );
}
