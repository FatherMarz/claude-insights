import type { ParsedDataset, ParsedMessage } from './parser.ts';
import { dateKeyMt } from './zone.ts';

export interface DailyTokens {
  date: string;
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
  total: number;
  prompts: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface SessionLengthBucket {
  bucket: string;
  count: number;
  minMinutes: number;
}

export interface OperationsAggregate {
  dailyTokens: DailyTokens[];
  sessionsPerProject: NamedCount[];
  toolUsage: NamedCount[];
  subagentTiers: { tier: string; count: number }[];
  sessionLength: SessionLengthBucket[];
  topCommands: NamedCount[];
}

function modelTier(model: string | undefined): 'opus' | 'sonnet' | 'haiku' | 'other' {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

const dateOnly = dateKeyMt;

function projectName(key: string): string {
  // key format: -Users-marcello-Documents-Development-Cabreza-codebase
  const parts = key.split('-').filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : key;
}

export function aggregateOperations(dataset: ParsedDataset): OperationsAggregate {
  const dailyMap = new Map<string, DailyTokens>();
  const projectSessions = new Map<string, Set<string>>();
  const toolCounts = new Map<string, number>();
  const subagentTierCounts = new Map<string, number>();
  const commandCounts = new Map<string, number>();
  const sessionTimes = new Map<string, { firstMs: number; lastMs: number }>();

  for (const msg of dataset.messages) {
    const day = dateOnly(msg.timestamp);
    if (!day) continue;

    let bucket = dailyMap.get(day);
    if (!bucket) {
      bucket = { date: day, opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0, prompts: 0 };
      dailyMap.set(day, bucket);
    }

    if (msg.type === 'user' && msg.userPrompt !== undefined) {
      bucket.prompts++;
    }

    if (msg.type === 'assistant') {
      const tier = modelTier(msg.model);
      const totalTokens =
        msg.inputTokens + msg.cacheCreationTokens + msg.cacheReadTokens + msg.outputTokens;

      bucket[tier] += totalTokens;
      bucket.total += totalTokens;

      for (const tool of msg.toolCalls) {
        toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
      }

      for (const spawn of msg.agentSpawns) {
        const spawnTier = spawn.model
          ? modelTier(spawn.model)
          : 'inherited';
        subagentTierCounts.set(spawnTier, (subagentTierCounts.get(spawnTier) ?? 0) + 1);
      }
    }

    if (msg.slashCommand) {
      commandCounts.set(msg.slashCommand, (commandCounts.get(msg.slashCommand) ?? 0) + 1);
    }

    if (msg.sessionId) {
      let projSet = projectSessions.get(msg.projectKey);
      if (!projSet) {
        projSet = new Set();
        projectSessions.set(msg.projectKey, projSet);
      }
      projSet.add(msg.sessionId);

      const ts = new Date(msg.timestamp).getTime();
      const existing = sessionTimes.get(msg.sessionId);
      if (!existing) sessionTimes.set(msg.sessionId, { firstMs: ts, lastMs: ts });
      else {
        if (ts < existing.firstMs) existing.firstMs = ts;
        if (ts > existing.lastMs) existing.lastMs = ts;
      }
    }
  }

  const dailyTokens = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const sessionsPerProject = Array.from(projectSessions.entries())
    .map(([key, set]) => ({ name: projectName(key), count: set.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const toolUsage = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const subagentTiers = Array.from(subagentTierCounts.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count);

  const topCommands = Array.from(commandCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Session length histogram
  const buckets: { label: string; min: number; max: number; count: number }[] = [
    { label: '<1m', min: 0, max: 1, count: 0 },
    { label: '1-5m', min: 1, max: 5, count: 0 },
    { label: '5-15m', min: 5, max: 15, count: 0 },
    { label: '15-30m', min: 15, max: 30, count: 0 },
    { label: '30-60m', min: 30, max: 60, count: 0 },
    { label: '1-2h', min: 60, max: 120, count: 0 },
    { label: '2-4h', min: 120, max: 240, count: 0 },
    { label: '4h+', min: 240, max: Infinity, count: 0 },
  ];

  for (const { firstMs, lastMs } of sessionTimes.values()) {
    const minutes = (lastMs - firstMs) / 60000;
    for (const b of buckets) {
      if (minutes >= b.min && minutes < b.max) {
        b.count++;
        break;
      }
    }
  }

  const sessionLength: SessionLengthBucket[] = buckets.map((b) => ({
    bucket: b.label,
    count: b.count,
    minMinutes: b.min,
  }));

  return { dailyTokens, sessionsPerProject, toolUsage, subagentTiers, sessionLength, topCommands };
}

export function totalAssistantMessages(dataset: ParsedDataset): number {
  let n = 0;
  for (const m of dataset.messages) if (m.type === 'assistant') n++;
  return n;
}

export type { ParsedMessage };
