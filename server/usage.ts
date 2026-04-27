import type { ParsedDataset, ParsedMessage } from './parser.ts';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

export interface UsageKpis {
  promptsThisWeek: number;
  promptsLastWeek: number;
  weekDeltaPct: number;
  avgBlockPrompts: number;
  avgBlockDurationMin: number;
  totalBlocks: number;
  activeBlock: {
    prompts: number;
    durationMin: number;
    expiresInMin: number;
  } | null;
}

export interface WeeklyPromptBucket {
  weekStart: string;
  prompts: number;
}

export interface BlockSizeBucket {
  bucket: string;
  count: number;
  minPrompts: number;
}

export interface BlocksPerDay {
  date: string;
  count: number;
}

export interface UsageAggregate {
  kpis: UsageKpis;
  weeklyPrompts: WeeklyPromptBucket[];
  blockSizeDistribution: BlockSizeBucket[];
  blocksPerDay: BlocksPerDay[];
}

function isoWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  if (dow !== 1) d.setUTCDate(d.getUTCDate() - dow + 1);
  return d;
}

function dateOnly(ts: string): string {
  return ts.slice(0, 10);
}

export function aggregateUsage(
  dataset: ParsedDataset,
  rolling14d?: ParsedDataset
): UsageAggregate {
  const userMessages: ParsedMessage[] = [];
  for (const m of dataset.messages) {
    if (m.type === 'user' && m.timestamp) userMessages.push(m);
  }
  userMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Rolling 7d / 7-14d KPI uses the rolling-14d dataset (range-independent).
  const rollingSource = rolling14d ?? dataset;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  let promptsThisWeek = 0;
  let promptsLastWeek = 0;
  for (const m of rollingSource.messages) {
    if (m.type !== 'user' || !m.timestamp) continue;
    const ts = new Date(m.timestamp).getTime();
    if (ts >= sevenDaysAgo) promptsThisWeek++;
    else if (ts >= fourteenDaysAgo) promptsLastWeek++;
  }
  const weekDeltaPct =
    promptsLastWeek > 0 ? ((promptsThisWeek - promptsLastWeek) / promptsLastWeek) * 100 : 0;

  // Weekly prompts chart (ISO week, Monday start) — uses the requested range
  const weekly = new Map<string, number>();
  for (const m of userMessages) {
    const ws = isoWeekStart(new Date(m.timestamp));
    const key = ws.toISOString().slice(0, 10);
    weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }
  const weeklyPrompts: WeeklyPromptBucket[] = Array.from(weekly.entries())
    .map(([weekStart, prompts]) => ({ weekStart, prompts }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  // 5-hour rolling blocks (Max plan reset window)
  interface Block {
    startMs: number;
    lastMs: number;
    prompts: number;
  }
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (const m of userMessages) {
    const ts = new Date(m.timestamp).getTime();
    if (currentBlock && ts <= currentBlock.startMs + FIVE_HOURS_MS) {
      currentBlock.prompts++;
      currentBlock.lastMs = ts;
    } else {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { startMs: ts, lastMs: ts, prompts: 1 };
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  const avgBlockPrompts =
    blocks.length > 0 ? blocks.reduce((s, b) => s + b.prompts, 0) / blocks.length : 0;
  const avgBlockDurationMin =
    blocks.length > 0
      ? blocks.reduce((s, b) => s + (b.lastMs - b.startMs), 0) / blocks.length / 60000
      : 0;

  let activeBlock: UsageKpis['activeBlock'] = null;
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (now - last.startMs < FIVE_HOURS_MS) {
      activeBlock = {
        prompts: last.prompts,
        durationMin: (now - last.startMs) / 60000,
        expiresInMin: (last.startMs + FIVE_HOURS_MS - now) / 60000,
      };
    }
  }

  const sizeBuckets = [
    { label: '1-5', min: 1, max: 5 },
    { label: '6-15', min: 6, max: 15 },
    { label: '16-30', min: 16, max: 30 },
    { label: '31-50', min: 31, max: 50 },
    { label: '51-100', min: 51, max: 100 },
    { label: '100+', min: 101, max: Infinity },
  ];
  const blockSizeDistribution: BlockSizeBucket[] = sizeBuckets.map((b) => ({
    bucket: b.label,
    count: blocks.filter((blk) => blk.prompts >= b.min && blk.prompts <= b.max).length,
    minPrompts: b.min,
  }));

  const blocksPerDayMap = new Map<string, number>();
  for (const b of blocks) {
    const d = dateOnly(new Date(b.startMs).toISOString());
    blocksPerDayMap.set(d, (blocksPerDayMap.get(d) ?? 0) + 1);
  }
  const blocksPerDay: BlocksPerDay[] = Array.from(blocksPerDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    kpis: {
      promptsThisWeek,
      promptsLastWeek,
      weekDeltaPct,
      avgBlockPrompts,
      avgBlockDurationMin,
      totalBlocks: blocks.length,
      activeBlock,
    },
    weeklyPrompts,
    blockSizeDistribution,
    blocksPerDay,
  };
}
