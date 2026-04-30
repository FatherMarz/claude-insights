import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, '..', 'data', 'credit-log.json');

export interface CreditLogEntry {
  id: string;
  timestamp: string;
  dollars: number;
  note?: string;
}

export interface CreditLogFile {
  entries: CreditLogEntry[];
}

const DEFAULTS: CreditLogFile = { entries: [] };

async function readFileSafe(): Promise<CreditLogFile> {
  try {
    const text = await readFile(LOG_FILE, 'utf8');
    const parsed = JSON.parse(text) as Partial<CreditLogFile>;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { ...DEFAULTS };
    throw err;
  }
}

async function writeFileSafe(data: CreditLogFile): Promise<void> {
  await mkdir(dirname(LOG_FILE), { recursive: true });
  await writeFile(LOG_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function getCreditLog(): Promise<CreditLogFile> {
  return readFileSafe();
}

export async function appendCreditLogEntry(input: {
  dollars: number;
  note?: string;
  timestamp?: string;
}): Promise<CreditLogEntry> {
  if (!Number.isFinite(input.dollars) || input.dollars <= 0) {
    throw new Error('dollars must be a positive number');
  }
  const data = await readFileSafe();
  const entry: CreditLogEntry = {
    id: randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    dollars: Math.round(input.dollars * 100) / 100,
    note: input.note?.trim() || undefined,
  };
  data.entries.push(entry);
  data.entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await writeFileSafe(data);
  return entry;
}

export async function deleteCreditLogEntry(id: string): Promise<boolean> {
  const data = await readFileSafe();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== id);
  if (data.entries.length === before) return false;
  await writeFileSafe(data);
  return true;
}
