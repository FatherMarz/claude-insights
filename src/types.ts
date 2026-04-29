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

export interface DailyRatio {
  date: string;
  value: number;
  numerator: number;
  denominator: number;
}

export interface OperationsAggregate {
  dailyTokens: DailyTokens[];
  sessionsPerProject: NamedCount[];
  toolUsage: NamedCount[];
  subagentTiers: { tier: string; count: number }[];
  sessionLength: SessionLengthBucket[];
  topCommands: NamedCount[];
}

export interface QualityAggregate {
  readEditRatio: DailyRatio[];
  reasoningLoopsPer1K: DailyRatio[];
  writeShare: DailyRatio[];
  thinkingRedactionRate: DailyRatio[];
  apiTurnsPerUserTurn: DailyRatio[];
  tokensPerUserTurn: DailyRatio[];
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

export interface UsageAggregate {
  kpis: UsageKpis;
  weeklyPrompts: { weekStart: string; prompts: number }[];
  blockSizeDistribution: { bucket: string; count: number; minPrompts: number }[];
  blocksPerDay: { date: string; count: number }[];
}

export interface FacetsAggregate {
  outcomes: { name: string; count: number }[];
  helpfulness: { name: string; count: number }[];
  sessionTypes: { name: string; count: number }[];
  topFriction: { name: string; count: number }[];
  totalSessionsAssessed: number;
  totalSessionsInRange: number;
}

export interface UsageLogEntry {
  id: string;
  timestamp: string;
  percent: number;
  note?: string;
}

export interface UsageLogConfig {
  resetDayOfWeek: number;
  resetHour: number;
  timezoneNote?: string;
}

export interface UsageLogFile {
  config: UsageLogConfig;
  entries: UsageLogEntry[];
}

export interface InsightsResponse {
  operations: OperationsAggregate;
  quality: QualityAggregate;
  activity: ActivityAggregate;
  usage: UsageAggregate;
  facets: FacetsAggregate;
  meta: {
    from: string | null;
    to: string | null;
    scannedAt: string;
    fileCount: number;
    errorCount: number;
    totalMessages: number;
    totalAssistantMessages: number;
    elapsedMs: number;
  };
}
