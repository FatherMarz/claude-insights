import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { parseAll } from './parser.ts';
import { aggregateOperations, totalAssistantMessages } from './aggregations.ts';
import { aggregateQuality } from './quality.ts';
import { aggregateActivity } from './activity.ts';
import { aggregateUsage } from './usage.ts';
import { aggregateFacets, loadAllFacets } from './facets.ts';
import {
  appendUsageLogEntry,
  deleteUsageLogEntry,
  getUsageLog,
  updateUsageLogConfig,
} from './usage-log.ts';
import {
  appendCreditLogEntry,
  deleteCreditLogEntry,
  getCreditLog,
} from './credit-log.ts';

const app = express();
const PORT = 3850;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, port: PORT });
});

app.get('/api/data', async (req: Request, res: Response) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;

  const t0 = Date.now();
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [dataset, rolling14d, allFacets] = await Promise.all([
      parseAll(from, to),
      parseAll(fourteenDaysAgo),
      loadAllFacets(),
    ]);
    const operations = aggregateOperations(dataset);
    const quality = aggregateQuality(dataset);
    const activity = aggregateActivity(dataset);
    const usage = aggregateUsage(dataset, rolling14d);
    const facets = aggregateFacets(dataset, allFacets);
    const elapsedMs = Date.now() - t0;

    res.json({
      operations,
      quality,
      activity,
      usage,
      facets,
      meta: {
        from: from ?? null,
        to: to ?? null,
        scannedAt: dataset.scannedAt,
        fileCount: dataset.fileCount,
        errorCount: dataset.errorCount,
        totalMessages: dataset.messages.length,
        totalAssistantMessages: totalAssistantMessages(dataset),
        elapsedMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/usage-log', async (_req: Request, res: Response) => {
  try {
    res.json(await getUsageLog());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.post('/api/usage-log', async (req: Request, res: Response) => {
  try {
    const { percent, note, timestamp } = req.body ?? {};
    const entry = await appendUsageLogEntry({
      percent: Number(percent),
      note: typeof note === 'string' ? note : undefined,
      timestamp: typeof timestamp === 'string' ? timestamp : undefined,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.delete('/api/usage-log/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const ok = await deleteUsageLogEntry(id);
    if (!ok) return res.status(404).json({ error: 'entry not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.patch('/api/usage-log/config', async (req: Request, res: Response) => {
  try {
    const config = await updateUsageLogConfig(req.body ?? {});
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.get('/api/credit-log', async (_req: Request, res: Response) => {
  try {
    res.json(await getCreditLog());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.post('/api/credit-log', async (req: Request, res: Response) => {
  try {
    const { dollars, note, timestamp } = req.body ?? {};
    const entry = await appendCreditLogEntry({
      dollars: Number(dollars),
      note: typeof note === 'string' ? note : undefined,
      timestamp: typeof timestamp === 'string' ? timestamp : undefined,
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.delete('/api/credit-log/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const ok = await deleteCreditLogEntry(id);
    if (!ok) return res.status(404).json({ error: 'entry not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'unknown error' });
  }
});

app.listen(PORT, () => {
  console.log(`[claude-insights] server listening on http://localhost:${PORT}`);
});
