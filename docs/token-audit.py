#!/usr/bin/env python3
"""One-shot token audit for personal+Cabreza Claude Code projects."""
import json
import sys
from collections import defaultdict
from pathlib import Path

PROJECTS = Path("/Users/marcello/.claude/projects")

def in_scope(name: str) -> bool:
    return (
        name.startswith("-Users-marcello-Documents-Development-Cabreza-codebase")
        or name.startswith("-Users-marcello-Documents-Development-personal")
    )

def label(name: str) -> str:
    if name.startswith("-Users-marcello-Documents-Development-Cabreza-codebase"):
        rest = name.replace("-Users-marcello-Documents-Development-Cabreza-codebase", "").strip("-")
        return f"cabreza/{rest or 'main'}"
    rest = name.replace("-Users-marcello-Documents-Development-personal", "").strip("-")
    return f"personal/{rest or 'main'}"

per_project = defaultdict(lambda: {"in": 0, "cc": 0, "cr": 0, "out": 0, "msgs": 0, "files": 0})
sessions: dict[str, dict] = {}
daily = defaultdict(lambda: {"in": 0, "cc": 0, "cr": 0, "out": 0})
tool_freq = defaultdict(int)
model_split = defaultdict(lambda: {"in": 0, "cc": 0, "cr": 0, "out": 0})
total_files = 0
total_lines = 0
parse_errors = 0

for project_dir in sorted(PROJECTS.iterdir()):
    if not project_dir.is_dir() or not in_scope(project_dir.name):
        continue
    proj = label(project_dir.name)

    for jsonl in project_dir.rglob("*.jsonl"):
        total_files += 1
        per_project[proj]["files"] += 1
        try:
            content = jsonl.read_text(errors="replace")
        except Exception:
            continue
        for line in content.splitlines():
            if not line.strip():
                continue
            total_lines += 1
            try:
                msg = json.loads(line)
            except Exception:
                parse_errors += 1
                continue
            ts = msg.get("timestamp", "") or ""
            day = ts[:10] if ts else "unknown"
            sid = msg.get("sessionId", "unknown")
            sess = sessions.setdefault(sid, {
                "project": proj, "in": 0, "cc": 0, "cr": 0, "out": 0,
                "msgs": 0, "first": "9999", "last": "0000",
            })
            sess["msgs"] += 1
            if ts and ts < sess["first"]:
                sess["first"] = ts
            if ts and ts > sess["last"]:
                sess["last"] = ts

            inner = msg.get("message") or {}
            usage = inner.get("usage") or {}
            if usage:
                inp = usage.get("input_tokens", 0) or 0
                cc = usage.get("cache_creation_input_tokens", 0) or 0
                cr = usage.get("cache_read_input_tokens", 0) or 0
                out = usage.get("output_tokens", 0) or 0
                per_project[proj]["in"] += inp
                per_project[proj]["cc"] += cc
                per_project[proj]["cr"] += cr
                per_project[proj]["out"] += out
                per_project[proj]["msgs"] += 1
                sess["in"] += inp; sess["cc"] += cc; sess["cr"] += cr; sess["out"] += out
                daily[day]["in"] += inp
                daily[day]["cc"] += cc
                daily[day]["cr"] += cr
                daily[day]["out"] += out
                model = inner.get("model", "unknown")
                model_split[model]["in"] += inp
                model_split[model]["cc"] += cc
                model_split[model]["cr"] += cr
                model_split[model]["out"] += out

            content_list = inner.get("content")
            if isinstance(content_list, list):
                for item in content_list:
                    if isinstance(item, dict) and item.get("type") == "tool_use":
                        tool_freq[item.get("name", "?")] += 1

# Summarize
def total_io(s):
    return s["in"] + s["cc"] + s["cr"] + s["out"]

scope_total = {"in": 0, "cc": 0, "cr": 0, "out": 0, "msgs": 0}
for v in per_project.values():
    for k in ("in", "cc", "cr", "out", "msgs"):
        scope_total[k] += v[k]

def k(n: int) -> str:
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

print("=" * 70)
print("TOKEN AUDIT — personal + Cabreza/codebase scope")
print("=" * 70)
print(f"Files parsed: {total_files}, lines: {total_lines}, parse errors: {parse_errors}")
print()
print("--- SCOPE TOTALS ---")
print(f"  Input tokens (raw new):     {scope_total['in']:>15,}  ({k(scope_total['in'])})")
print(f"  Cache creation tokens:      {scope_total['cc']:>15,}  ({k(scope_total['cc'])})")
print(f"  Cache read tokens:          {scope_total['cr']:>15,}  ({k(scope_total['cr'])})")
print(f"  Output tokens:              {scope_total['out']:>15,}  ({k(scope_total['out'])})")
total_input = scope_total['in'] + scope_total['cc'] + scope_total['cr']
total_io_all = total_input + scope_total['out']
print(f"  TOTAL INPUT (raw+cc+cr):    {total_input:>15,}  ({k(total_input)})")
print(f"  TOTAL I/O:                  {total_io_all:>15,}  ({k(total_io_all)})")
print(f"  Cache hit ratio (cr / total_input): {scope_total['cr']/total_input*100:.1f}%")
print(f"  Output : Input ratio: {scope_total['out']/total_input*100:.1f}%")
print()
print("--- TOP 12 PROJECTS BY TOTAL I/O ---")
projs = sorted(per_project.items(), key=lambda x: -total_io(x[1]))
for proj, v in projs[:12]:
    pct = total_io(v) / total_io_all * 100
    print(f"  {pct:>5.1f}%  in={k(v['in']):>7}  cc={k(v['cc']):>7}  cr={k(v['cr']):>7}  out={k(v['out']):>7}  msgs={v['msgs']:>6}  {proj}")
print()
print("--- TOP 10 SESSIONS BY TOTAL I/O ---")
sess_sorted = sorted(
    [(sid, s) for sid, s in sessions.items() if total_io(s) > 0],
    key=lambda x: -total_io(x[1])
)
for sid, s in sess_sorted[:10]:
    duration_h = "?"
    try:
        from datetime import datetime
        if s["first"] != "9999" and s["last"] != "0000":
            f = datetime.fromisoformat(s["first"].replace("Z", "+00:00"))
            l = datetime.fromisoformat(s["last"].replace("Z", "+00:00"))
            duration_h = f"{(l-f).total_seconds()/3600:.1f}h"
    except Exception:
        pass
    print(f"  {k(total_io(s)):>7}  msgs={s['msgs']:>5}  dur={duration_h:>5}  {s['first'][:10]}  {s['project']}  {sid[:8]}")
print()
print("--- TOP 15 TOOLS BY INVOCATION COUNT ---")
for tool, n in sorted(tool_freq.items(), key=lambda x: -x[1])[:15]:
    print(f"  {n:>7}  {tool}")
print()
print("--- TOKENS BY MODEL ---")
for model, v in sorted(model_split.items(), key=lambda x: -total_io(x[1])):
    print(f"  in={k(v['in']):>7}  cc={k(v['cc']):>7}  cr={k(v['cr']):>7}  out={k(v['out']):>7}  {model}")
print()
print("--- LAST 30 DAYS DAILY TIMELINE ---")
recent_days = sorted([d for d in daily.keys() if d != "unknown"])[-30:]
for d in recent_days:
    v = daily[d]
    bar_len = int(total_io(v) / max(1, max(total_io(daily[x]) for x in recent_days)) * 40)
    bar = "█" * bar_len
    print(f"  {d}  in={k(v['in']+v['cc']+v['cr']):>7}  out={k(v['out']):>5}  {bar}")
