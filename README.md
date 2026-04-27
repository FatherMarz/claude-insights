# claude-insights

Local meta-monitoring for Claude Code. Reads the JSONL session logs Claude Code already writes to `~/.claude/projects/`, parses them, and shows operational, quality, activity, and Max-plan usage trends in a dark cockpit-style dashboard.

No network calls. No account. No telemetry. Runs entirely on data already on your disk.

## What you get

Four tabs over a date-range filter (7d / 30d / 60d / 90d / 180d):

- **Operations** — tokens by model (daily), sessions per project, tool usage, subagent spawns by tier, session-length distribution, top slash commands.
- **Quality** — drift signals inspired by [cc-canary](https://github.com/delta-hq/cc-canary): read:edit ratio, reasoning-loop frequency, write share of mutations, thinking-redaction rate, API turns per user turn, tokens per user turn. With healthy/warning/concerning bands where applicable.
- **Activity** — KPI strip (sessions, active hours, total tokens, tool calls, response times, est. cost) plus charts for hour-of-day, sessions per day, cost per day by model, token-type breakdown, response-time trend.
- **Usage** — Max-plan style metrics: prompts this week vs last week (rolling 7d / 7-14d), 5h block size distribution, blocks per day, plus optional session outcomes / helpfulness / friction reasons from `~/.claude/usage-data/facets/` if those exist.

## Requirements

- **Node 20+** (uses `fs/promises`, ESM)
- **Claude Code installed and used** (this is what produces the JSONL files at `~/.claude/projects/`)

That's it. macOS and Linux work. Windows is untested but should work — Claude Code's project directory layout is the same.

## Quick start

```bash
git clone <your-fork-url>
cd claude-insights
npm install
npm run dev
```

Then open `http://localhost:4747`.

The first load will parse all your session JSONLs and may take a couple of seconds. After that, an in-memory mtime cache makes every subsequent load <200ms — only changed/new files get re-parsed.

## What the data is

| Source | What we use it for |
|--------|-------------------|
| `~/.claude/projects/<encoded-project>/*.jsonl` | All operations, quality, activity, and usage metrics. One file per session. Dedupes assistant messages on `(message.id, requestId)` so resumed/branched sessions don't double-count. |
| `~/.claude/usage-data/facets/*.json` (optional) | Session outcomes, helpfulness, friction breakdowns on the Usage tab. Generated externally. If you don't have these, the corresponding charts show "no data" and everything else still works. |

Nothing is uploaded anywhere. The frontend talks to a localhost-only Express server that reads files off your disk.

## Architecture

```
claude-insights/
├── server/              Express on port 3850
│   ├── index.ts         GET /api/data?from=&to=
│   ├── parser.ts        Walks ~/.claude/projects/, parallel reads, mtime cache
│   ├── aggregations.ts  Operations metrics
│   ├── quality.ts       Drift / quality signals
│   ├── activity.ts      KPIs, hour-of-day, cost, response times
│   ├── usage.ts         Weekly prompts + 5h block analysis
│   └── facets.ts        Reads ~/.claude/usage-data/facets/
└── src/                 Vite + React + recharts on port 4747
    ├── App.tsx          Tab switcher + filter bar
    ├── tabs/
    │   ├── Operations.tsx
    │   ├── Quality.tsx
    │   ├── Activity.tsx
    │   └── Usage.tsx
    └── styles.css       Mission Control theme — carbon black, phosphor green, copper, canary
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Server (3850) + Vite (4747) in parallel |
| `npm run server` | Server only |
| `npm run build` | Production build of the frontend |
| `npm run preview` | Preview the production build |

Ports are hard-coded; edit `server/index.ts` (`PORT = 3850`) and `vite.config.ts` (`port: 4747`) if you have conflicts.

## What it doesn't do

- No real-time tail of the current session (refresh to see updates).
- No subscription-state lookup. The Max plan's `/usage` numbers come from Anthropic's API; we approximate with rolling 7-day prompt counts and 5h session blocks derived from JSONL timestamps.
- No dollar-cost calculation tuned to your actual contract — the cost estimate uses public API rates as a directional ceiling.
- No facet generation — we only read existing facets if they're on disk.
- No auth, no multi-user. Localhost only, your machine.

## Inspiration / prior art

- [cc-canary](https://github.com/delta-hq/cc-canary) — drift detection for Claude Code, a one-shot forensic skill. The Quality tab cherry-picks the high-signal metrics and shows them as trends.
- [ccusage](https://github.com/ryoppippi/ccusage) — the dedupe key `(message.id, requestId)` was learned from their parser.
- The `claude-activity` skill that ships in some Claude Code installs — pointed at the same JSONL data and gave the metric vocabulary on the Activity tab.

## License

MIT — see [LICENSE](./LICENSE).
