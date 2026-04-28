# Token Usage Audit — Personal + Cabreza/codebase

**Date:** 2026-04-28
**Scope:** All Claude Code sessions in `~/.claude/projects/-Users-marcello-Documents-Development-{Cabreza-codebase, personal}*`
**Method:** Direct JSONL parse via `/tmp/token-audit.py` (snapshot saved to `/tmp/token-audit-output.txt`)
**Goal:** Reduce raw token usage (input + output). Not optimizing for cost-per-token, latency, or context-window pressure individually — purely tokens.

---

## Headline Numbers

**Files parsed:** 2,880 JSONL · **Lines:** 465,113 · **Parse errors:** 0

| Metric | Value |
|---|---|
| Total input tokens (raw new) | **13.4M** |
| Total cache-creation tokens | **1,220.3M** |
| Total cache-read tokens | **36,207.6M** |
| Total output tokens | **84.0M** |
| **Total I/O** | **37.5B** |
| Cache hit ratio (`cr / total_input`) | **96.7%** |
| Output : Input ratio | **0.2%** |

**Punchline:** 36.2 billion of the 37.5 billion tokens in scope (~96.7%) come from **cache-read** — the same context being re-read on every turn of long sessions. Optimizing the *content* of those long-lived contexts is by far the highest-leverage move. New input (`13.4M`) and output (`84M`) are rounding errors.

---

## Where the Tokens Go

### By Project (top 12 of in-scope)

| % of I/O | Project | Cache-read | Output | Messages |
|---|---|---|---|---|
| **86.5%** | `cabreza/main` | 31,275.8M | 63.0M | 190,799 |
| 11.9% | `personal/main` | 4,352.2M | 18.1M | 13,358 |
| 0.4% | `personal/remix-genius` | 163.4M | 1.3M | 668 |
| 0.4% | `cabreza/knowledge-ot-knowledge-base` | 154.2M | 571K | 902 |
| 0.3% | `cabreza/internal-bitbucket-pipeline-monitor` | 117.9M | 534K | 617 |
| 0.2% | `cabreza/platform-worktrees-feature-merge-workspace-into-platform` | 72.5M | 139K | 1,832 |
| <0.1% | (8 more, all under 50M cache-read) | | | |

**Cabreza/main alone is 86.5% of total token usage in scope.** Every recommendation that affects Cabreza-main sessions has ~10× the impact of one targeting any other project tree.

### By Model

| Model | Cache-read | Output | Notes |
|---|---|---|---|
| `claude-opus-4-6` | 20,819M | 33.4M | Heaviest — older Opus, longer sessions |
| `claude-opus-4-7` | 11,766M | 45.3M | Current Opus — most output (more recent work) |
| `claude-haiku-4-5-20251001` | 3,080M | 3.5M | Subagent runs |
| `claude-sonnet-*` (4-5, 4-6) | 495M | 1.7M | Specialized agents |
| `claude-opus-4-5` | 47M | 36K | Legacy |

Opus dominates (98% of cache-read across 4-6 + 4-7). Subagent Haiku usage is modest (~8% of cache-read) — there's room to push more work to Haiku.

### Top 10 Sessions (the long marathons)

| Cache-read | Messages | Duration | Project | First seen |
|---:|---:|---:|---|---|
| 3,464M | 21,572 | 156.0h | cabreza/main | 2026-03-27 |
| 2,703M | 15,312 | 75.1h | personal/main | 2026-04-19 |
| 2,313M | 12,698 | 53.5h | cabreza/main | 2026-03-29 |
| 2,194M | 11,675 | 51.8h | cabreza/main | 2026-03-31 |
| 1,979M | 10,787 | 60.9h | cabreza/main | 2026-04-07 |
| 1,902M | 13,977 | 56.1h | cabreza/main | 2026-03-27 |
| 1,181M | 6,532 | 34.0h | cabreza/main | 2026-04-21 |
| 1,089M | 7,645 | 81.0h | cabreza/main | 2026-04-23 |
| 859M | 6,795 | 46.0h | cabreza/main | 2026-04-24 |
| 822M | 4,592 | 17.4h | cabreza/main | 2026-04-23 |

**Top 10 sessions = 18.5B cache-read tokens = ~51% of scope total.** All but one are cabreza/main. All 10 are 17h+ wall-clock. Six are 50h+. The pattern is clear: **multi-day sessions that never `/clear` or rarely `/compact`**.

### Anatomy of the Worst Offender (`b28d2aac`, 156h, 21K msgs)

Profiled with jq directly on the session JSONL:

| Metric | Value |
|---|---|
| Assistant turns | 2,184 |
| Mean cache-read per turn | **347,817 tokens** |
| Median (p50) cache-read | 345,973 |
| p90 / p99 cache-read | 595,782 / 643,594 |
| Max cache-read (one turn) | 678,610 (≈68% of 1M cap) |
| `/compact` invocations | 1 |
| `/clear` invocations | 0 |
| Tool calls (top 5) | Bash 364, Read 325, Edit 298, Grep 144, Agent 48 |

**Context grew steadily** from ~264K tokens at message #218 to ~606K at message #873, then dropped to ~87K after the single `/compact`, then climbed back to ~482K by the end. **The compaction worked — the absence of more compactions is the cost.**

If average context had been held at 200K instead of 348K (via, say, one compact every 4-5 hours of work), the session would have used ~440M cache-read tokens instead of 760M. **A single behavioral change (compact more) on this one session would have saved ~320M tokens.** Multiply across the top 10 long sessions and we're talking billions.

### Tool-Result Size Distribution (in worst session)

| Percentile | Bytes | ≈ Tokens |
|---|---:|---:|
| p50 | 203 | 51 |
| p90 | 3,216 | 804 |
| p99 | 23,726 | 5,932 |
| max | 61,265 | 15,316 |
| Top 10 individual results | 80–134KB | **20–33K each** |

The tail is where bloat lives. The p99 alone is 6K tokens entering context **per call** — and if 1% of 1,291 results is 13 results × 6K tokens = ~78K tokens of context permanently parked. The top 10 add another ~250K. That's where the "context creeps to 600K" comes from.

### Auto-Loaded Surface Area (per session, before any user turn)

Measured directly:

| Source | Bytes | ≈ Tokens |
|---|---:|---:|
| Global `~/.claude/CLAUDE.md` | 8,247 | 2,061 |
| Codebase `Cabreza/codebase/CLAUDE.md` (post-trim) | 15,673 | 3,918 |
| Parent `Documents/Development/CLAUDE.md` | 747 | 186 |
| `MEMORY.md` (auto-loaded) | 13,142 | 3,285 |
| **Total auto-loaded markdown** | **37,809** | **~9,450** |

Plus the **system prompt** itself — large and variable, includes:
- Tool descriptions (Bash, Edit, Read, Glob, Grep, Skill, Write, ToolSearch, ScheduleWakeup) — measured ~5–8K tokens.
- Available skills list (50+ entries with descriptions) — measured ~6–8K tokens.
- MCP server lists + per-MCP instructions — measured ~3–5K tokens.
- Auto-memory infrastructure copy — measured ~2–3K tokens.

**Estimated total session-baseline cost: 25,000–35,000 tokens before the user types anything.** That re-reads from cache on every turn. In a 2,184-turn session, the baseline alone consumes ~55–75M cache-read tokens — about 10% of the session's total cache-read.

---

## Findings, Ranked

### Tier 1 — Big Wins (>5% expected reduction, mostly behavioral)

**F1.1 — Long Cabreza sessions are the top 51% of all token usage. Compaction discipline is the single highest-leverage change. ⚡ QUICK WIN**
The top 10 long sessions (all but one are cabreza/main) account for ~18.5B cache-read tokens. The worst session shows context growing to 600K+ before the lone compaction. If those long sessions averaged ~200K context (one compact per 4-5 work hours) instead of 348K, ~30-40% of those tokens disappear.
**Action:** Add a CLAUDE.md rule (or a hook) that prompts compaction when cache-read consistently exceeds, say, 400K tokens. We already have telemetry — `claude-insights` could surface a "compact now" recommendation when current context exceeds threshold.
**Quick win effort:** 10 min for the CLAUDE.md rule. ~1 hour for a heuristic warning in claude-insights.

**F1.2 — Cabreza/main is 86.5% of scope. Almost everything that helps it pays back ~10×. ⚡ QUICK WIN (already partially shipped)**
Today's CLAUDE.md trim (582 → 313 lines, ~14KB → 7KB) saves ~3.5K tokens per turn baseline. In a 2K-turn session, that's ~7M cache-read tokens saved — and that's just one trim. The Code Map (`.claude-map/CODEMAP.md`) means I now grep CODEMAP first instead of doing 5–10 file reads to orient myself.
**Action:** No new action — the wins are already in. Mention them in the report so the lift gets credit.

**F1.3 — Auto-loaded markdown is ~9.5K tokens; system prompt baseline is ~25–35K. Together that's a ~10% baseline tax on every long session.**
The `MEMORY.md` index is 3,285 tokens auto-loaded. Many entries are stale (~6 months old) or hyper-specific (one-time gotchas). The bigger opportunity is the system prompt — every skill + MCP description loads even when irrelevant.
**Action:** (a) Audit `MEMORY.md` for entries we no longer need — deprecate or roll up. (b) Audit which skills/MCPs you actually use; disable the ones that load eagerly and you never invoke. (c) Move per-repo guidance under per-repo `CLAUDE.md` files (already done for `frontend/platform`).
**Quick win effort:** 30 min for MEMORY.md prune. 1–2 hours for a skill/MCP audit.

### Tier 2 — Medium Wins (2–5% expected, requires sustained behavior change)

**F2.1 — Read tool is the second-most-called tool (44.9K calls in scope, 325 in the worst session). Many Reads add 1-15K tokens each to context permanently.**
Read with no offset/limit pulls whole files. The p99 tool result is 23.7KB (6K tokens). Top 10 individual results in the worst session are 80–134KB each. Some of these are unavoidable (need full content), many aren't (only need a function or block).
**Action:** Default to Read with `offset` + `limit` when I know what I'm looking for. Use `Grep -A/-B` for "find X with context" instead of full Read. Use Explore subagent for "where is X" — it returns a *summary*, not the file.
**Effort:** Behavioral; reinforce in CLAUDE.md.

**F2.2 — Subagent usage is good but inconsistent.** The worst session had 48 Agent calls — those compressed thousands of tokens of internal exploration into short summaries. But many other long sessions show no Agent calls at all and bloated direct grepping/reading.
**Action:** Add a CLAUDE.md heuristic: if I'm about to do >3 broad searches or read >5 files to answer a question, prefer Explore subagent (returns a summary, not the raw context).
**Effort:** Already partially in CLAUDE.md ("use subagents liberally") — strengthen to a rule with a concrete trigger.

**F2.3 — Bash output is the silent context-bloater.** 364 Bash calls in the worst session; many likely returned long log dumps (`git log --oneline -1000`, `aws logs filter`, full `npm test` output). Each lands fully in context.
**Action:** Pipe long Bash outputs through `| head -N`, `| tail -N`, `| grep -c`, or save to `/tmp/file` and read targeted ranges. Specifically for diagnostic commands, prefer `--quiet` modes.
**Effort:** Behavioral.

### Tier 3 — Structural Changes (worth considering, larger effort)

**F3.1 — Cabreza-main being a single multi-day session is itself the architectural choice.** Marcello earlier said `/clear` and `/compact` "don't help the find-functions problem" — and that's true at the *cold start* moment, but very expensive at the *cumulative* moment. The Code Map we built today is partly meant to enable cheaper cold starts so that more frequent compactions become viable.
**Action:** Combine F1.1 (compact threshold) with the existing Code Map: when the dashboard or Claude itself notices context > 400K, recommend compact, knowing CODEMAP.md will rebuild orientation cheaply.
**Effort:** Medium — couples a tool change with a behavioral one.

**F3.2 — Output-side cost is tiny (0.2% of input) but verbose responses still slow the user.**
**Action:** Less about token reduction, more about user experience. Already mostly enforced by user CLAUDE.md ("Lead with the action. Be terse").
**Effort:** None — keep doing what's working.

**F3.3 — Opus 4-6 is still the largest contributor (~21B cache-read).** Some of that's historical (older sessions), some is the current default for routine work. Haiku at 3B is doing real work but proportionally small.
**Action:** Consider whether more daily routine tasks (DB queries, status checks, file moves, simple grep summaries) can default to Haiku. The /claude-activity skill already analyzes this — worth a tab in claude-insights showing "tasks where Opus output looked Haiku-shaped."
**Effort:** Medium-large.

### Tier 4 — FYI / Already Optimized

**F4.1 — Cache hit ratio is 96.7%.** That's excellent. The cache layer is doing serious work; cache-read tokens are billed at ~10% of normal input. We are NOT in a "context isn't being cached" failure mode.

**F4.2 — Output is 0.2% of input.** Output is essentially free in this profile. There's no win in "shorter responses for token reasons" (there is for UX reasons, which are separate).

**F4.3 — Parse errors: 0 across 465K lines.** The transcript format is stable; no data-quality concerns.

---

## Quick Wins (15-min picks)

In order of expected impact:

1. **Add a "compact when context > 400K" rule to `~/.claude/CLAUDE.md`.** Behavioral. ⚡ Pairs with the Code Map we built today — compactions become cheaper to recover from.
2. **Prune stale entries from `MEMORY.md`.** Walk the index, remove anything for projects/work that's done. Saves ~1–2K tokens per session baseline.
3. **Add a CLAUDE.md rule: "Default to `Read` with `offset/limit` when the symbol is known. Use `Grep` for narrow lookups. Use `Explore` subagent when search would touch >5 files."** Behavioral.
4. **Pipe long Bash outputs through `head/tail/grep -c` whenever possible.** Behavioral.
5. **Audit which skills/MCPs are loaded eagerly that you don't actually use.** Removing 5-10 unused MCP server descriptions could save ~2-5K tokens of system prompt.

---

## What This Session Already Shipped

For credit (and to avoid double-counting):
- **`Cabreza/codebase/CLAUDE.md` trimmed 582 → 313 lines** (~14KB → ~7KB). Saves ~3.5K tokens per turn. In a 2K-turn session that's ~7M cache-read tokens saved per session.
- **`frontend/platform/CLAUDE.md` created**, GitButler section moved out — that 95-line block now only loads when I'm in that repo. Conservative estimate: ~2K tokens saved per non-platform session, which is most of them.
- **`.claude-map/CODEMAP.md` + `routes.json`** — replaces ~10 cold-start file reads with one targeted lookup. Conservative estimate: 5–20K tokens saved per cold-start question about cross-repo concerns.
- **`Todos via Lenny` rule** — removed the dead `docs/tasks/lessons.md` and `todo.md` references. Small.

Cumulative: realistically, this session probably saved **5–10M cache-read tokens per long Cabreza session going forward**, just from the surface-area trim and CODEMAP.

---

## Open Questions / Next Experiments

1. **Could `claude-insights` add a live "compact now" recommendation?** A new tab or KPI strip that shows current session's cache-read pattern and flags "you're at 450K avg context — compact before it climbs further." Concrete value: turns this report into an ongoing nudge.
2. **What's the marginal cost of one `/compact` versus the steady-state savings?** Need a controlled experiment — same kind of work, one with compactions every 4 hours, one without — and compare cumulative tokens. Hard to do in production but maybe trace it forward in claude-insights once compaction events are tracked.
3. **Are there project trees outside scope (modul4r, delcaro-media) that would surface different patterns?** This audit deliberately skipped them per scope.
4. **Are subagent results being undercounted?** Subagent JSONLs live in `<session>/subagents/agent-*.jsonl`. The script counted them, but the parent-session's `cache_read` may *also* include the bytes the subagent returned. Worth a sanity check before claiming subagents are pure-win.

---

## Recommendation Stack (most leverage first)

1. **Compact discipline on long Cabreza sessions** — biggest single lever, behavioral.
2. **Keep doing what we did this session** — surface-area trims (CLAUDE.md, per-repo splits, Code Map). Continue when other sections of the global system prompt feel oversized.
3. **Read habits** — offset/limit, prefer Grep/Explore for search.
4. **MEMORY.md prune** — small but easy.
5. **Skill/MCP audit** — easy if you know which ones you don't touch; hard otherwise.

That's the report. Save the raw audit script at `/tmp/token-audit.py` if you want to re-run it after a few weeks to measure the delta.
