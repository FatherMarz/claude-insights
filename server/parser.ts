import { readdirSync, statSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface AgentSpawn {
  subagentType?: string;
  model?: string;
}

export interface ParsedMessage {
  type: 'user' | 'assistant';
  sessionId: string;
  projectKey: string;
  cwd: string;
  timestamp: string;
  model?: string;
  isSidechain: boolean;
  inputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  toolCalls: string[];
  agentSpawns: AgentSpawn[];
  hasThinking: boolean;
  thinkingRedacted: boolean;
  thinkingLength: number;
  textContent: string;
  userPrompt?: string;
  slashCommand?: string;
}

export interface ParsedDataset {
  messages: ParsedMessage[];
  scannedAt: string;
  fileCount: number;
  errorCount: number;
}

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

function decodeProjectKey(key: string): string {
  return key.replace(/^-/, '/').replace(/-/g, '/');
}

function extractContent(content: unknown): {
  toolCalls: string[];
  agentSpawns: AgentSpawn[];
  hasThinking: boolean;
  thinkingRedacted: boolean;
  thinkingLength: number;
  textContent: string;
} {
  const result = {
    toolCalls: [] as string[],
    agentSpawns: [] as AgentSpawn[],
    hasThinking: false,
    thinkingRedacted: false,
    thinkingLength: 0,
    textContent: '',
  };

  if (typeof content === 'string') {
    result.textContent = content;
    return result;
  }

  if (!Array.isArray(content)) return result;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;

    if (b.type === 'tool_use' && typeof b.name === 'string') {
      result.toolCalls.push(b.name);
      if (b.name === 'Agent' && b.input && typeof b.input === 'object') {
        const input = b.input as Record<string, unknown>;
        result.agentSpawns.push({
          subagentType: typeof input.subagent_type === 'string' ? input.subagent_type : undefined,
          model: typeof input.model === 'string' ? input.model : undefined,
        });
      }
    } else if (b.type === 'thinking') {
      result.hasThinking = true;
      const thinking = typeof b.thinking === 'string' ? b.thinking : '';
      result.thinkingLength += thinking.length;
      if (thinking.length === 0) result.thinkingRedacted = true;
    } else if (b.type === 'redacted_thinking') {
      result.hasThinking = true;
      result.thinkingRedacted = true;
    } else if (b.type === 'text' && typeof b.text === 'string') {
      result.textContent += b.text;
    }
  }

  return result;
}

function extractSlashCommand(content: unknown): string | undefined {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    for (const b of content) {
      if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text') {
        const t = (b as Record<string, unknown>).text;
        if (typeof t === 'string') text += t;
      }
    }
  }
  const match = text.match(/<command-name>([^<]+)<\/command-name>/);
  return match ? match[1].trim() : undefined;
}

async function parseFile(path: string, projectKey: string): Promise<ParsedMessage[]> {
  const content = await readFile(path, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());
  const seen = new Set<string>();
  const out: ParsedMessage[] = [];

  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type;
    if (type !== 'user' && type !== 'assistant') continue;

    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) continue;

    // Dedupe assistant messages on (message.id, requestId) — same scheme ccusage uses.
    if (type === 'assistant') {
      const dedupeKey = `${message.id ?? ''}|${entry.requestId ?? ''}`;
      if (dedupeKey !== '|' && seen.has(dedupeKey)) continue;
      if (dedupeKey !== '|') seen.add(dedupeKey);
    }

    const usage = (message.usage as Record<string, unknown> | undefined) ?? {};
    const extracted = extractContent(message.content);
    const slashCommand = type === 'user' ? extractSlashCommand(message.content) : undefined;

    out.push({
      type: type as 'user' | 'assistant',
      sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : '',
      projectKey,
      cwd: typeof entry.cwd === 'string' ? entry.cwd : decodeProjectKey(projectKey),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
      model: typeof message.model === 'string' ? message.model : undefined,
      isSidechain: entry.isSidechain === true,
      inputTokens: Number(usage.input_tokens) || 0,
      cacheCreationTokens: Number(usage.cache_creation_input_tokens) || 0,
      cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
      outputTokens: Number(usage.output_tokens) || 0,
      toolCalls: extracted.toolCalls,
      agentSpawns: extracted.agentSpawns,
      hasThinking: extracted.hasThinking,
      thinkingRedacted: extracted.thinkingRedacted,
      thinkingLength: extracted.thinkingLength,
      textContent: extracted.textContent,
      userPrompt: type === 'user' && typeof message.content === 'string' ? message.content : undefined,
      slashCommand,
    });
  }

  return out;
}

// In-memory cache: filePath -> { mtimeMs, parsed messages }.
// Reused across requests; entries invalidate when the file's mtime changes.
interface FileCacheEntry {
  mtimeMs: number;
  messages: ParsedMessage[];
}
const fileCache = new Map<string, FileCacheEntry>();

interface ScanTask {
  filePath: string;
  projectKey: string;
  mtimeMs: number;
  cacheHit: boolean;
}

export async function parseAll(fromIso?: string, toIso?: string): Promise<ParsedDataset> {
  const fromMs = fromIso ? new Date(fromIso).getTime() : 0;
  const toMs = toIso ? new Date(toIso).getTime() : Date.now();

  let errorCount = 0;
  const tasks: ScanTask[] = [];

  const projects = readdirSync(PROJECTS_DIR);
  for (const projectKey of projects) {
    const projectPath = join(PROJECTS_DIR, projectKey);
    let entries: string[];
    try {
      if (!statSync(projectPath).isDirectory()) continue;
      entries = readdirSync(projectPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(projectPath, entry);
      if (entry.endsWith('.jsonl')) {
        try {
          const stat = statSync(entryPath);
          if (stat.mtimeMs < fromMs) continue;
          const cached = fileCache.get(entryPath);
          tasks.push({
            filePath: entryPath,
            projectKey,
            mtimeMs: stat.mtimeMs,
            cacheHit: cached?.mtimeMs === stat.mtimeMs,
          });
        } catch {
          errorCount++;
        }
        continue;
      }

      // Subagent JSONLs live at <projectKey>/<session-uuid>/subagents/*.jsonl.
      // Each Task spawn writes its own jsonl with its own session-id.
      try {
        const sub = join(entryPath, 'subagents');
        if (!statSync(sub).isDirectory()) continue;
        for (const subFile of readdirSync(sub)) {
          if (!subFile.endsWith('.jsonl')) continue;
          const subPath = join(sub, subFile);
          try {
            const stat = statSync(subPath);
            if (stat.mtimeMs < fromMs) continue;
            const cached = fileCache.get(subPath);
            tasks.push({
              filePath: subPath,
              projectKey,
              mtimeMs: stat.mtimeMs,
              cacheHit: cached?.mtimeMs === stat.mtimeMs,
            });
          } catch {
            errorCount++;
          }
        }
      } catch {
        // not a directory or no subagents/ folder — fine, skip
      }
    }
  }

  // Parse uncached files in parallel; cached files are reused as-is.
  const toParse = tasks.filter((t) => !t.cacheHit);
  await Promise.all(
    toParse.map(async (task) => {
      try {
        const parsed = await parseFile(task.filePath, task.projectKey);
        fileCache.set(task.filePath, { mtimeMs: task.mtimeMs, messages: parsed });
      } catch {
        errorCount++;
      }
    })
  );

  // Filter cached messages by the requested time range and merge.
  const messages: ParsedMessage[] = [];
  for (const task of tasks) {
    const entry = fileCache.get(task.filePath);
    if (!entry) continue;
    for (const msg of entry.messages) {
      if (!msg.timestamp) continue;
      const ts = new Date(msg.timestamp).getTime();
      if (ts < fromMs || ts > toMs) continue;
      messages.push(msg);
    }
  }

  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    messages,
    scannedAt: new Date().toISOString(),
    fileCount: tasks.length,
    errorCount,
  };
}
