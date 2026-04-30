import type {
  CreditLogEntry,
  CreditLogFile,
  InsightsResponse,
  UsageLogConfig,
  UsageLogEntry,
  UsageLogFile,
} from './types.ts';

export async function fetchInsights(from: string, to: string): Promise<InsightsResponse> {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/data?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as InsightsResponse;
}

export async function fetchUsageLog(): Promise<UsageLogFile> {
  const res = await fetch('/api/usage-log');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as UsageLogFile;
}

export async function postUsageLogEntry(input: {
  percent: number;
  note?: string;
}): Promise<UsageLogEntry> {
  const res = await fetch('/api/usage-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UsageLogEntry;
}

export async function deleteUsageLogEntry(id: string): Promise<void> {
  const res = await fetch(`/api/usage-log/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
}

export async function fetchCreditLog(): Promise<CreditLogFile> {
  const res = await fetch('/api/credit-log');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CreditLogFile;
}

export async function postCreditLogEntry(input: {
  dollars: number;
  note?: string;
}): Promise<CreditLogEntry> {
  const res = await fetch('/api/credit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as CreditLogEntry;
}

export async function deleteCreditLogEntry(id: string): Promise<void> {
  const res = await fetch(`/api/credit-log/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
}

export async function patchUsageLogConfig(patch: Partial<UsageLogConfig>): Promise<UsageLogConfig> {
  const res = await fetch('/api/usage-log/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UsageLogConfig;
}
