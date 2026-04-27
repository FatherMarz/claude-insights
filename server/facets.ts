import { readdirSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ParsedDataset } from './parser.ts';

const FACETS_DIR = join(homedir(), '.claude', 'usage-data', 'facets');

export interface Facet {
  sessionId: string;
  outcome?: string;
  claudeHelpfulness?: string;
  sessionType?: string;
  primarySuccess?: string;
  frictionCounts: Record<string, number>;
}

interface FacetCacheEntry {
  mtimeMs: number;
  facet: Facet | null;
}
const facetsCache = new Map<string, FacetCacheEntry>();

async function parseFacetFile(path: string): Promise<Facet | null> {
  try {
    const text = await readFile(path, 'utf8');
    const data = JSON.parse(text) as Record<string, unknown>;
    const sessionId = typeof data.session_id === 'string' ? data.session_id : '';
    if (!sessionId) return null;
    return {
      sessionId,
      outcome: typeof data.outcome === 'string' ? data.outcome : undefined,
      claudeHelpfulness:
        typeof data.claude_helpfulness === 'string' ? data.claude_helpfulness : undefined,
      sessionType: typeof data.session_type === 'string' ? data.session_type : undefined,
      primarySuccess: typeof data.primary_success === 'string' ? data.primary_success : undefined,
      frictionCounts: (data.friction_counts as Record<string, number>) ?? {},
    };
  } catch {
    return null;
  }
}

export async function loadAllFacets(): Promise<Map<string, Facet>> {
  let entries: string[];
  try {
    entries = readdirSync(FACETS_DIR);
  } catch {
    return new Map();
  }

  interface Task {
    path: string;
    mtimeMs: number;
    cacheHit: boolean;
  }
  const tasks: Task[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const path = join(FACETS_DIR, entry);
    try {
      const stat = statSync(path);
      const cached = facetsCache.get(path);
      tasks.push({
        path,
        mtimeMs: stat.mtimeMs,
        cacheHit: cached?.mtimeMs === stat.mtimeMs,
      });
    } catch {
      continue;
    }
  }

  const toParse = tasks.filter((t) => !t.cacheHit);
  await Promise.all(
    toParse.map(async (task) => {
      const facet = await parseFacetFile(task.path);
      facetsCache.set(task.path, { mtimeMs: task.mtimeMs, facet });
    })
  );

  const out = new Map<string, Facet>();
  for (const task of tasks) {
    const entry = facetsCache.get(task.path);
    if (entry?.facet) out.set(entry.facet.sessionId, entry.facet);
  }
  return out;
}

export interface FacetsAggregate {
  outcomes: { name: string; count: number }[];
  helpfulness: { name: string; count: number }[];
  sessionTypes: { name: string; count: number }[];
  topFriction: { name: string; count: number }[];
  totalSessionsAssessed: number;
  totalSessionsInRange: number;
}

export function aggregateFacets(
  dataset: ParsedDataset,
  allFacets: Map<string, Facet>
): FacetsAggregate {
  const sessionsInRange = new Set<string>();
  for (const m of dataset.messages) {
    if (m.sessionId) sessionsInRange.add(m.sessionId);
  }

  const outcomes = new Map<string, number>();
  const helpfulness = new Map<string, number>();
  const sessionTypes = new Map<string, number>();
  const friction = new Map<string, number>();
  let assessed = 0;

  for (const sid of sessionsInRange) {
    const f = allFacets.get(sid);
    if (!f) continue;
    assessed++;
    if (f.outcome) outcomes.set(f.outcome, (outcomes.get(f.outcome) ?? 0) + 1);
    if (f.claudeHelpfulness)
      helpfulness.set(f.claudeHelpfulness, (helpfulness.get(f.claudeHelpfulness) ?? 0) + 1);
    if (f.sessionType)
      sessionTypes.set(f.sessionType, (sessionTypes.get(f.sessionType) ?? 0) + 1);
    for (const [name, count] of Object.entries(f.frictionCounts)) {
      friction.set(name, (friction.get(name) ?? 0) + count);
    }
  }

  const toArr = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return {
    outcomes: toArr(outcomes),
    helpfulness: toArr(helpfulness),
    sessionTypes: toArr(sessionTypes),
    topFriction: toArr(friction).slice(0, 10),
    totalSessionsAssessed: assessed,
    totalSessionsInRange: sessionsInRange.size,
  };
}
