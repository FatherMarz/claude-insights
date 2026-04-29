import type { ParsedDataset, ParsedMessage } from './parser.ts';
import { dateKeyMt, hourMt } from './zone.ts';

interface Rates {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

const RATES: Record<string, Rates> = {
  opus: { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
  other: { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
};

const ACTIVE_GAP_MS = 30 * 60 * 1000;
const RESPONSE_TIME_CAP_MS = 60 * 60 * 1000;

function tierOf(model: string | undefined): keyof typeof RATES {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

const dateOnly = dateKeyMt;

function computeCost(msg: ParsedMessage): number {
  const r = RATES[tierOf(msg.model)];
  return (
    (msg.inputTokens * r.input +
      msg.outputTokens * r.output +
      msg.cacheCreationTokens * r.cacheCreation +
      msg.cacheReadTokens * r.cacheRead) /
    1_000_000
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface ActivityKPIs {
  sessions: number;
  activeHours: number;
  userTimeHours: number;
  claudeTimeHours: number;
  toolCalls: number;
  avgResponseTimeSec: number;
  medianResponseTimeSec: number;
  totalCost: number;
  totalTokens: {
    input: number;
    cacheCreation: number;
    cacheRead: number;
    output: number;
    total: number;
  };
}

export interface DailyCost {
  date: string;
  opus: number;
  sonnet: number;
  haiku: number;
  other: number;
  total: number;
}

export interface HourBucket {
  hour: number;
  count: number;
}

export interface DailyResponseTime {
  date: string;
  avgSec: number;
  medianSec: number;
  samples: number;
}

export interface DailySessions {
  date: string;
  count: number;
}

export interface DailyTimeSplit {
  date: string;
  userHours: number;
  claudeHours: number;
}

export interface ActivityAggregate {
  kpis: ActivityKPIs;
  hourDistribution: HourBucket[];
  sessionsPerDay: DailySessions[];
  costPerDay: DailyCost[];
  responseTimePerDay: DailyResponseTime[];
  timeSplitPerDay: DailyTimeSplit[];
  tokenBreakdown: { name: string; value: number }[];
}

export function aggregateActivity(dataset: ParsedDataset): ActivityAggregate {
  // Group messages by session
  const bySession = new Map<string, ParsedMessage[]>();
  const sessionFirstDate = new Map<string, string>();

  for (const msg of dataset.messages) {
    if (!msg.sessionId) continue;
    let arr = bySession.get(msg.sessionId);
    if (!arr) {
      arr = [];
      bySession.set(msg.sessionId, arr);
    }
    arr.push(msg);
  }

  // Sort each session's messages by timestamp
  for (const [sid, msgs] of bySession) {
    msgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    sessionFirstDate.set(sid, dateOnly(msgs[0].timestamp));
  }

  let activeMs = 0;
  let userTimeMs = 0;
  let claudeTimeMs = 0;
  let toolCalls = 0;
  let totalInput = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let totalOutput = 0;
  let totalCost = 0;

  const hourCounts = new Array<number>(24).fill(0);
  const sessionsPerDayMap = new Map<string, number>();
  const costPerDayMap = new Map<string, DailyCost>();
  const responsesByDay = new Map<string, number[]>();
  const timeSplitByDay = new Map<string, { userMs: number; claudeMs: number }>();

  for (const [, msgs] of bySession) {
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];

      // Hour-of-day on assistant messages (when work is happening)
      if (m.type === 'assistant' && m.timestamp) {
        const hour = hourMt(m.timestamp);
        hourCounts[hour]++;

        toolCalls += m.toolCalls.length;

        totalInput += m.inputTokens;
        totalCacheCreation += m.cacheCreationTokens;
        totalCacheRead += m.cacheReadTokens;
        totalOutput += m.outputTokens;

        const cost = computeCost(m);
        totalCost += cost;

        const day = dateOnly(m.timestamp);
        let bucket = costPerDayMap.get(day);
        if (!bucket) {
          bucket = { date: day, opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 };
          costPerDayMap.set(day, bucket);
        }
        bucket[tierOf(m.model)] += cost;
        bucket.total += cost;
      }

      // Active time: gap-capped at ACTIVE_GAP_MS (excludes idle).
      // Time split — hybrid cap policy:
      //   - gap before a real user prompt = your reading/typing pause.
      //     Cap at ACTIVE_GAP_MS. Longer = walked-away idle, drop both sides.
      //   - gap before tool_result / assistant continuation = Claude working.
      //     NO cap. A 4-hour Bash run is real Claude time.
      if (i > 0) {
        const gap = new Date(m.timestamp).getTime() - new Date(msgs[i - 1].timestamp).getTime();
        if (gap > 0) {
          if (gap < ACTIVE_GAP_MS) activeMs += gap;

          const isUserPromptNext = m.type === 'user' && m.userPrompt !== undefined;
          const counts = isUserPromptNext ? gap < ACTIVE_GAP_MS : true;
          if (counts) {
            const day = dateOnly(m.timestamp);
            let split = timeSplitByDay.get(day);
            if (!split) {
              split = { userMs: 0, claudeMs: 0 };
              timeSplitByDay.set(day, split);
            }
            if (isUserPromptNext) {
              userTimeMs += gap;
              split.userMs += gap;
            } else {
              claudeTimeMs += gap;
              split.claudeMs += gap;
            }
          }
        }
      }

      // Response time: user → next assistant
      if (m.type === 'user' && i + 1 < msgs.length && msgs[i + 1].type === 'assistant') {
        const dt = new Date(msgs[i + 1].timestamp).getTime() - new Date(m.timestamp).getTime();
        if (dt > 0 && dt < RESPONSE_TIME_CAP_MS) {
          const day = dateOnly(m.timestamp);
          let arr = responsesByDay.get(day);
          if (!arr) {
            arr = [];
            responsesByDay.set(day, arr);
          }
          arr.push(dt / 1000);
        }
      }
    }
  }

  // Sessions per day (first-message day)
  for (const day of sessionFirstDate.values()) {
    sessionsPerDayMap.set(day, (sessionsPerDayMap.get(day) ?? 0) + 1);
  }

  const allResponses: number[] = [];
  const responseTimePerDay: DailyResponseTime[] = [];
  const responseDates = Array.from(responsesByDay.keys()).sort();
  for (const date of responseDates) {
    const arr = responsesByDay.get(date)!;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    responseTimePerDay.push({ date, avgSec: avg, medianSec: median(arr), samples: arr.length });
    for (const v of arr) allResponses.push(v);
  }

  const totalTokens =
    totalInput + totalCacheCreation + totalCacheRead + totalOutput;

  const kpis: ActivityKPIs = {
    sessions: bySession.size,
    activeHours: activeMs / 3_600_000,
    userTimeHours: userTimeMs / 3_600_000,
    claudeTimeHours: claudeTimeMs / 3_600_000,
    toolCalls,
    avgResponseTimeSec:
      allResponses.length > 0
        ? allResponses.reduce((a, b) => a + b, 0) / allResponses.length
        : 0,
    medianResponseTimeSec: median(allResponses),
    totalCost,
    totalTokens: {
      input: totalInput,
      cacheCreation: totalCacheCreation,
      cacheRead: totalCacheRead,
      output: totalOutput,
      total: totalTokens,
    },
  };

  const hourDistribution: HourBucket[] = hourCounts.map((count, hour) => ({ hour, count }));

  const sessionsPerDay: DailySessions[] = Array.from(sessionsPerDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const costPerDay: DailyCost[] = Array.from(costPerDayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const tokenBreakdown = [
    { name: 'Input', value: totalInput },
    { name: 'Cache create', value: totalCacheCreation },
    { name: 'Cache read', value: totalCacheRead },
    { name: 'Output', value: totalOutput },
  ];

  const timeSplitPerDay: DailyTimeSplit[] = Array.from(timeSplitByDay.entries())
    .map(([date, { userMs, claudeMs }]) => ({
      date,
      userHours: userMs / 3_600_000,
      claudeHours: claudeMs / 3_600_000,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    kpis,
    hourDistribution,
    sessionsPerDay,
    costPerDay,
    responseTimePerDay,
    timeSplitPerDay,
    tokenBreakdown,
  };
}
