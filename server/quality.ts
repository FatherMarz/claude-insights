import type { ParsedDataset } from './parser.ts';

export interface DailyRatio {
  date: string;
  value: number;
  numerator: number;
  denominator: number;
}

export interface QualityAggregate {
  readEditRatio: DailyRatio[];
  reasoningLoopsPer1K: DailyRatio[];
  writeShare: DailyRatio[];
  thinkingRedactionRate: DailyRatio[];
  apiTurnsPerUserTurn: DailyRatio[];
  tokensPerUserTurn: DailyRatio[];
}

const REASONING_LOOP_RE = /\b(let me try again|actually,|oh wait|wait,|on second thought|let me reconsider|hmm,|let me rethink)\b/gi;

function dateOnly(ts: string): string {
  return ts.slice(0, 10);
}

interface DayBucket {
  reads: number;
  edits: number;
  writes: number;
  toolCallCount: number;
  reasoningLoopHits: number;
  thinkingTotal: number;
  thinkingRedacted: number;
  assistantTurns: number;
  userTurns: number;
  totalTokens: number;
}

function blank(): DayBucket {
  return {
    reads: 0,
    edits: 0,
    writes: 0,
    toolCallCount: 0,
    reasoningLoopHits: 0,
    thinkingTotal: 0,
    thinkingRedacted: 0,
    assistantTurns: 0,
    userTurns: 0,
    totalTokens: 0,
  };
}

export function aggregateQuality(dataset: ParsedDataset): QualityAggregate {
  const days = new Map<string, DayBucket>();

  for (const msg of dataset.messages) {
    const day = dateOnly(msg.timestamp);
    if (!day) continue;

    let b = days.get(day);
    if (!b) {
      b = blank();
      days.set(day, b);
    }

    if (msg.type === 'user') {
      b.userTurns++;
    } else {
      b.assistantTurns++;
      b.totalTokens +=
        msg.inputTokens + msg.cacheCreationTokens + msg.cacheReadTokens + msg.outputTokens;

      for (const tool of msg.toolCalls) {
        b.toolCallCount++;
        if (tool === 'Read') b.reads++;
        else if (tool === 'Edit') b.edits++;
        else if (tool === 'Write') b.writes++;
      }

      if (msg.hasThinking) {
        b.thinkingTotal++;
        if (msg.thinkingRedacted) b.thinkingRedacted++;
      }

      if (msg.textContent) {
        const matches = msg.textContent.match(REASONING_LOOP_RE);
        if (matches) b.reasoningLoopHits += matches.length;
      }
    }
  }

  const sortedDates = Array.from(days.keys()).sort();

  const series = (
    pick: (b: DayBucket) => { num: number; den: number; scale?: number }
  ): DailyRatio[] =>
    sortedDates.map((date) => {
      const b = days.get(date)!;
      const { num, den, scale = 1 } = pick(b);
      const value = den > 0 ? (num / den) * scale : 0;
      return { date, value, numerator: num, denominator: den };
    });

  return {
    readEditRatio: series((b) => ({ num: b.reads, den: b.edits })),
    reasoningLoopsPer1K: series((b) => ({
      num: b.reasoningLoopHits,
      den: b.toolCallCount,
      scale: 1000,
    })),
    writeShare: series((b) => ({ num: b.writes, den: b.edits + b.writes })),
    thinkingRedactionRate: series((b) => ({ num: b.thinkingRedacted, den: b.thinkingTotal })),
    apiTurnsPerUserTurn: series((b) => ({ num: b.assistantTurns, den: b.userTurns })),
    tokensPerUserTurn: series((b) => ({ num: b.totalTokens, den: b.userTurns })),
  };
}
