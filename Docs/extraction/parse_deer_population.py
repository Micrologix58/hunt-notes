"""
Parses CPW's "Post Hunt Population & Sex Ratio Estimates" (Deer) PDFs into
rows of: dau, herd_name (may be absent -- varies by year), gmus, population
estimate, buck/doe ratio.

These are small, genuinely linear single-page tables (same text-in-reading-
order situation as the Bear harvest report) -- no coordinate reconstruction
needed. What varies year to year is the exact shape:
  - Some years print a "Herd Name" column, some don't.
  - "Total Statewide Estimate" appears either before or after the DAU rows,
    and is followed by either 1 number (estimate only) or 2 (estimate +
    statewide ratio).
  - DAU numbers are sometimes bare ("1"), sometimes zero-padded ("01"), and
    a few carry footnote asterisks ("20**", "56**", "57***") marking a
    merged/created DAU -- stripped here, not treated as part of the number.
This parser detects each of those per-row/per-file rather than assuming one
fixed layout, by walking the line stream and testing each line against a
few lightweight patterns instead of fixed column positions.

CPW restructured several DAUs in 2024 (old DAUs 21/22/25 merged into new 57;
old 31/37 merged into new 56) -- that shows up here as some DAU numbers only
having data for part of the 2019-2025 range. That's real and not a parsing
gap; this script doesn't attempt to reconcile old/new DAU numbers.

Usage: python parse_deer_population.py <pdf_path> <season_year> <out_jsonl_path>
"""
import sys
import json
import re
import pymupdf

DAU_RE = re.compile(r"^(\d{1,3})(\*{1,3})?$")
GMU_LIST_RE = re.compile(r"^[\d][\d,\s]*$")
NUMBER_RE = re.compile(r"^[\d,]+$")


def parse_lines(lines):
    # Find where the real header ends -- the line naming the GMU column is
    # always present and unique, so anchor on it and then skip whatever
    # header/total-row fragments follow until the first real DAU row.
    start = None
    for i, line in enumerate(lines):
        if "GAME MANAGEMENT UNITS" in line.upper():
            start = i + 1
            break
    if start is None:
        raise ValueError("Could not find 'GAME MANAGEMENT UNITS' header line")

    records = []
    i = start
    n = len(lines)
    seen_first_dau = False
    while i < n:
        line = lines[i]

        if line.startswith("Total Statewide"):
            i += 1
            consumed = 0
            while i < n and consumed < 2 and NUMBER_RE.match(lines[i]):
                i += 1
                consumed += 1
            continue

        m = DAU_RE.match(line)
        if not m:
            if seen_first_dau:
                break  # hit trailing footnotes/date/title lines
            i += 1  # still skipping header fragments before the first DAU row
            continue

        seen_first_dau = True
        dau = m.group(1)
        i += 1
        if i >= n:
            break

        herd_name = None
        candidate = lines[i]
        if GMU_LIST_RE.match(candidate):
            gmus = candidate
            i += 1
        else:
            # Usually "HerdName" alone with the GMU list on the next line,
            # but at least one row (2024's DAU 20) has them merged onto one
            # line by the extractor ("North Fork Gunnison River 53,63") --
            # split off a trailing GMU-list-shaped run if present.
            combined = re.match(r"^(.*\D)\s+(\d[\d,\s]*)$", candidate)
            if combined and GMU_LIST_RE.match(combined.group(2)):
                herd_name = combined.group(1).strip()
                gmus = combined.group(2).strip()
                i += 1
            else:
                herd_name = candidate
                i += 1
                gmus = lines[i]
                i += 1
        population = lines[i]
        i += 1
        ratio = lines[i]
        i += 1

        records.append({
            "dau": dau,
            "herdName": herd_name,
            "gmus": gmus,
            "population": population,
            "ratio": ratio,
        })

    return records


def main():
    pdf_path, season_year, out_path = sys.argv[1:4]
    doc = pymupdf.open(pdf_path)
    text = doc[0].get_text()
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    records = parse_lines(lines)

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(records)} DAU records -> {out_path}")


if __name__ == "__main__":
    main()
