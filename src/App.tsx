import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchInsights } from './api.ts';
import { OperationsTab } from './tabs/Operations.tsx';
import { QualityTab } from './tabs/Quality.tsx';
import { ActivityTab } from './tabs/Activity.tsx';
import { UsageTab } from './tabs/Usage.tsx';

type TabId = 'operations' | 'quality' | 'activity' | 'usage';

const RANGES = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '60d', label: '60d', days: 60 },
  { id: '90d', label: '90d', days: 90 },
  { id: '180d', label: '180d', days: 180 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

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
  const [tab, setTab] = useState<TabId>('operations');
  const [rangeId, setRangeId] = useState<RangeId>('30d');

  const { from, to } = useMemo(() => {
    const range = RANGES.find((r) => r.id === rangeId)!;
    return { from: isoFor(range.days), to: todayIso() };
  }, [rangeId]);

  const query = useQuery({
    queryKey: ['insights', from, to],
    queryFn: () => fetchInsights(from, to),
  });

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

      <div className="filter-bar">
        <span className="filter-label">Range</span>
        {RANGES.map((r) => (
          <button
            key={r.id}
            data-active={rangeId === r.id}
            onClick={() => setRangeId(r.id)}
          >
            {r.label}
          </button>
        ))}
        {query.data && (
          <div className="meta-strip" style={{ marginLeft: 'auto' }}>
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

      <div className="tabs">
        <button
          className="tab"
          data-active={tab === 'operations'}
          onClick={() => setTab('operations')}
        >
          Operations
        </button>
        <button
          className="tab"
          data-active={tab === 'quality'}
          onClick={() => setTab('quality')}
        >
          Quality
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
          data-active={tab === 'usage'}
          onClick={() => setTab('usage')}
        >
          Usage
        </button>
      </div>

      {query.isLoading && <div className="loading">Parsing JSONL files…</div>}
      {query.error && (
        <div className="error">Failed to load insights: {(query.error as Error).message}</div>
      )}
      {query.data && tab === 'operations' && <OperationsTab data={query.data.operations} />}
      {query.data && tab === 'quality' && <QualityTab data={query.data.quality} />}
      {query.data && tab === 'activity' && <ActivityTab data={query.data.activity} />}
      {query.data && tab === 'usage' && (
        <UsageTab usage={query.data.usage} facets={query.data.facets} />
      )}
    </div>
  );
}
