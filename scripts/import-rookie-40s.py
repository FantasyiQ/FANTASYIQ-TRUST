#!/usr/bin/env python3
"""
Sync 40-yard-dash times from the master rookie spreadsheet into the seed file.

Source of truth: "2026 NFL DRAFT.xlsx" (Sheet1, column "40") in OneDrive.
This script reads that sheet and writes `fortyTime` onto each matching player
entry in scripts/seed-rookie-rankings-2026.ts (matched by name, case-insensitive,
punctuation-insensitive). After running, run the seed to push to the DB:

    python3 scripts/import-rookie-40s.py
    npx tsx scripts/seed-rookie-rankings-2026.ts

Workflow: enter QB/RB (or any missing) 40s in the spreadsheet, then re-run.
"""
import re, sys, os
import openpyxl

XLSX = os.environ.get("ROOKIE_XLSX",
    "/Users/russ/Library/CloudStorage/OneDrive-FantasyiQTrust/2026 NFL DRAFT.xlsx")
SEED = os.path.join(os.path.dirname(__file__), "seed-rookie-rankings-2026.ts")

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

# ── 1. Read 40 times from the spreadsheet ────────────────────────────────────
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["Sheet1"]
rows = list(ws.iter_rows(values_only=True))
hdr = rows[0]
idx = {h: i for i, h in enumerate(hdr)}
pi, fi = idx["Player"], idx[40]

sheet = {}          # norm-name -> (display-name, forty)
for r in rows[1:]:
    if not r or r[pi] is None:
        continue
    forty = r[fi]
    if forty in (None, ""):
        continue
    sheet[norm(r[pi])] = (str(r[pi]).strip(), float(forty))

print(f"Spreadsheet: {len(sheet)} players have a 40 time.")

# ── 2. Rewrite the seed file, setting fortyTime on each matched line ──────────
lines = open(SEED).read().splitlines(keepends=True)
name_re = re.compile(r"playerName:\s*(?:'([^']*)'|\"([^\"]*)\")")

updated, used = 0, set()
out = []
for line in lines:
    m = name_re.search(line)
    if not m:
        out.append(line); continue
    name = m.group(1) if m.group(1) is not None else m.group(2)
    key = norm(name)
    if key not in sheet:
        out.append(line); continue
    used.add(key)
    _, forty = sheet[key]
    val = f"{forty:.2f}"
    nl = "\n" if line.endswith("\n") else ""
    body = line.rstrip("\n")
    if "fortyTime:" in body:
        body = re.sub(r"fortyTime:\s*[0-9.]+", f"fortyTime: {val}", body)
    else:
        body = re.sub(r"\s*\}\s*,\s*$", f", fortyTime: {val} }},", body)
    out.append(body + nl)
    updated += 1

open(SEED, "w").write("".join(out))

# ── 3. Report ────────────────────────────────────────────────────────────────
print(f"Seed updated: wrote fortyTime onto {updated} player entries.")
not_in_seed = [sheet[k][0] for k in sheet if k not in used]
if not_in_seed:
    print(f"\n⚠️  {len(not_in_seed)} spreadsheet players had a 40 but no matching seed entry:")
    for n in sorted(not_in_seed):
        print(f"     - {n}")
else:
    print("\n✅  Every spreadsheet 40 matched a seed entry.")
