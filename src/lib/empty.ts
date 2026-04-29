import type { InsightsResponse } from '../types.ts';

// Zero-valued dataset matching InsightsResponse shape. Used to render the
// skeleton (strips, cards, axes) before the real data arrives so the layout
// doesn't shift on first paint.
export function emptyInsights(): InsightsResponse {
  return {
    activity: {
      kpis: {
        sessions: 0,
        activeHours: 0,
        userTimeHours: 0,
        claudeTimeHours: 0,
        toolCalls: 0,
        avgResponseTimeSec: 0,
        medianResponseTimeSec: 0,
        totalCost: 0,
        totalTokens: { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, total: 0 },
      },
      hourDistribution: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
      sessionsPerDay: [],
      costPerDay: [],
      responseTimePerDay: [],
      timeSplitPerDay: [],
      tokenBreakdown: [],
    },
    operations: {
      dailyTokens: [],
      sessionsPerProject: [],
      toolUsage: [],
      subagentTiers: [],
      sessionLength: [],
      topCommands: [],
    },
    quality: {
      readEditRatio: [],
      reasoningLoopsPer1K: [],
      writeShare: [],
      thinkingRedactionRate: [],
      apiTurnsPerUserTurn: [],
      tokensPerUserTurn: [],
    },
    usage: {
      kpis: {
        promptsThisWeek: 0,
        promptsLastWeek: 0,
        weekDeltaPct: 0,
        avgBlockPrompts: 0,
        avgBlockDurationMin: 0,
        totalBlocks: 0,
        activeBlock: null,
      },
      weeklyPrompts: [],
      blockSizeDistribution: [],
      blocksPerDay: [],
    },
    facets: {
      outcomes: [],
      helpfulness: [],
      sessionTypes: [],
      topFriction: [],
      totalSessionsAssessed: 0,
      totalSessionsInRange: 0,
    },
    meta: {
      from: null,
      to: null,
      scannedAt: '',
      fileCount: 0,
      errorCount: 0,
      totalMessages: 0,
      totalAssistantMessages: 0,
      elapsedMs: 0,
    },
  };
}
