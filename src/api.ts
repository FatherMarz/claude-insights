import type { InsightsResponse } from './types.ts';

export async function fetchInsights(from: string, to: string): Promise<InsightsResponse> {
  const params = new URLSearchParams({ from, to });
  const res = await fetch(`/api/data?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as InsightsResponse;
}
