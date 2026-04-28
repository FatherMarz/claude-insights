import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, '..', 'data', 'usage-log.json');

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

const DEFAULTS: UsageLogFile = {
  config: { resetDayOfWeek: 4, resetHour: 20, timezoneNote: 'Local time' },
  entries: [],
};

async function readFileSafe(): Promise<UsageLogFile> {
  try {
    const text = await readFile(LOG_FILE, 'utf8');
    const parsed = JSON.parse(text) as Partial<UsageLogFile>;
    return {
      config: { ...DEFAULTS.config, ...(parsed.config ?? {}) },
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ...DEFAULTS };
    throw err;
  }
}

async function writeFileSafe(data: UsageLogFile): Promise<void> {
  await mkdir(dirname(LOG_FILE), { recursive: true });
  await writeFile(LOG_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function getUsageLog(): Promise<UsageLogFile> {
  return readFileSafe();
}

export async function appendUsageLogEntry(input: {
  percent: number;
  note?: string;
  timestamp?: string;
}): Promise<UsageLogEntry> {
  if (!Number.isFinite(input.percent) || input.percent < 0 || input.percent > 100) {
    throw new Error('percent must be a number between 0 and 100');
  }
  const data = await readFileSafe();
  const entry: UsageLogEntry = {
    id: randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    percent: Math.round(input.percent * 100) / 100,
    note: input.note?.trim() || undefined,
  };
  data.entries.push(entry);
  data.entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await writeFileSafe(data);
  return entry;
}

export async function deleteUsageLogEntry(id: string): Promise<boolean> {
  const data = await readFileSafe();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  if (data.entries.length === before) return false;
  await writeFileSafe(data);
  return true;
}

export async function updateUsageLogConfig(
  patch: Partial<UsageLogConfig>
): Promise<UsageLogConfig> {
  const data = await readFileSafe();
  if (patch.resetDayOfWeek != null) {
    if (!Number.isInteger(patch.resetDayOfWeek) || patch.resetDayOfWeek < 0 || patch.resetDayOfWeek > 6) {
      throw new Error('resetDayOfWeek must be an integer 0-6');
    }
    data.config.resetDayOfWeek = patch.resetDayOfWeek;
  }
  if (patch.resetHour != null) {
    if (!Number.isInteger(patch.resetHour) || patch.resetHour < 0 || patch.resetHour > 23) {
      throw new Error('resetHour must be an integer 0-23');
    }
    data.config.resetHour = patch.resetHour;
  }
  if (patch.timezoneNote !== undefined) {
    data.config.timezoneNote = patch.timezoneNote;
  }
  await writeFileSafe(data);
  return data.config;
}
