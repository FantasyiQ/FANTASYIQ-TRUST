#!/usr/bin/env python3
"""
Sync verified measurements (Height, Weight, 40-yard dash) from the master
rookie spreadsheet into the seed file.

Source of truth: "2026 NFL DRAFT.xlsx" (Sheet1) in OneDrive.
Columns used: Player, Height, Weight, 40.

Rules (the spreadsheet is authoritative):
  • Height / Weight — overwrite the seed when the sheet has a value; keep the
    existing seed value when the sheet cell is blank (never lose data).
  • 40 — verified-only: set when the sheet has a value, CLEAR (remove fortyTime)
    when the sheet cell is blank. So unverified/DNP 40s get pruned.

After running, push to the DB:
    python3 scripts/import-rookie-40s.py
    npx tsx scripts/seed-rookie-rankings-2026.ts

Workflow: enter verified numbers in the spreadsheet, then re-run.
"""
import re, sys, os
import openpyxl

XLSX = os.environ.get("ROOKIE_XLSX",
    "/Users/russ/Library/CloudStorage/OneDrive-FantasyiQTrust/2026 NFL DRAFT.xlsx")
SEED = os.path.join(os.path.dirname(__file__), "seed-rookie-rankings-2026.ts")

def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

# ── 1. Read measurements from the spreadsheet ────────────────────────────────
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["Sheet1"]
rows = list(ws.iter_rows(values_only=True))
hdr = rows[0]; idx = {h: i for i, h in enumerate(hdr)}
pi, hi, wi, fi = idx["Player"], idx["Height"], idx["Weight"], idx[40]

def blank(v):
    return v in (None, "")

def parse_forty(v):
    """Numeric 40 = verified value; blank or text (e.g. 'DNP') = no verified 40."""
    if blank(v):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None

sheet = {}  # norm-name -> {height, weight, forty} (any may be None)
for r in rows[1:]:
    if not r or r[pi] is None:
        continue
    sheet[norm(r[pi])] = {
        "height": None if blank(r[hi]) else str(r[hi]).strip(),
        "weight": None if blank(r[wi]) else int(r[wi]),
        "forty":  parse_forty(r[fi]),
    }
print(f"Spreadsheet: {len(sheet)} player rows read.")

# ── 2. Rewrite the seed, syncing height/weight/fortyTime on each line ─────────
lines = open(SEED).read().splitlines(keepends=True)
name_re   = re.compile(r"playerName:\s*(?:'([^']*)'|\"([^\"]*)\")")
height_re = re.compile(r",\s*height:\s*\"(?:[^\"\\]|\\.)*\"")
weight_re = re.compile(r",\s*weight:\s*\d+")
forty_re  = re.compile(r",\s*fortyTime:\s*[0-9.]+")

set_h = set_w = set_f = clr_f = 0
not_in_sheet = []
out = []
for line in lines:
    m = name_re.search(line)
    if not m:
        out.append(line); continue
    name = m.group(1) if m.group(1) is not None else m.group(2)
    key = norm(name)
    if key not in sheet:
        not_in_sheet.append(name); out.append(line); continue

    nl = "\n" if line.endswith("\n") else ""
    body = line.rstrip("\n")

    # capture existing tokens, then strip them
    ex_h = height_re.search(body)
    ex_w = weight_re.search(body)
    ex_h = ex_h.group(0).lstrip(", ") if ex_h else None
    ex_w = ex_w.group(0).lstrip(", ") if ex_w else None
    body = forty_re.sub("", body)
    body = height_re.sub("", body)
    body = weight_re.sub("", body)

    s = sheet[key]
    tokens = []
    # height: sheet wins, else keep existing
    if s["height"] is not None:
        tokens.append(f'height: "{s["height"].replace(chr(34), chr(92)+chr(34))}"'); set_h += 1
    elif ex_h:
        tokens.append(ex_h)
    # weight
    if s["weight"] is not None:
        tokens.append(f'weight: {s["weight"]}'); set_w += 1
    elif ex_w:
        tokens.append(ex_w)
    # fortyTime: verified-only
    if s["forty"] is not None:
        tokens.append(f'fortyTime: {s["forty"]:.2f}'); set_f += 1
    else:
        clr_f += 1

    insert = (", " + ", ".join(tokens)) if tokens else ""
    body = re.sub(r"\s*\}\s*,\s*$", f"{insert} }},", body)
    out.append(body + nl)

open(SEED, "w").write("".join(out))

# ── 3. Report ────────────────────────────────────────────────────────────────
print(f"Synced -> heights: {set_h}, weights: {set_w}, 40s set: {set_f}, 40s cleared/absent: {clr_f}")
if not_in_sheet:
    print(f"\n⚠️  {len(not_in_sheet)} seed players not found in sheet (left untouched):")
    for n in sorted(not_in_sheet):
        print(f"     - {n}")
else:
    print("✅  Every seed player matched a spreadsheet row.")
