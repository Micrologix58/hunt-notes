"""
Parses CPW's "Post Hunt Population & Sex Ratio Estimates" PDFs (Deer, Elk
-- same report template, just a different species and a Bucks/Does vs.
Bulls/Cows ratio label) into rows of: dau, herd_name (may be absent --
varies by year/species), gmus, population estimate, ratio (buck:doe or
bull:cow, same "per 100" shape either way).

These are small, genuinely linear single-page tables (same text-in-reading-
order situation as the Bear harvest report) -- no coordinate reconstruction
needed. What varies year to year (and sometimes species to species) is the
exact shape:
  - Some years print a "Herd Name" column, some don't (Elk's reports never
    have it filled in even when the column header is present).
  - "Total Statewide Estimate" appears either before or after the DAU rows,
    and is followed by either 1 number (estimate only) or 2 (estimate +
    statewide ratio).
  - DAU numbers are sometimes bare ("1"), sometimes zero-padded ("01"), and
    a few carry footnote asterisks ("20**", "56**", "57***") marking a
    merged/created DAU -- stripped here, not treated as part of the number.
  - The "GAME MANAGEMENT UNITS" header is sometimes misspelled "GAME
    MANAGEMENT UNITES" (seen in several Elk years) -- matched without the
    trailing S so either spelling works.
This parser detects each of those per-row/per-file rather than assuming one
fixed layout, by walking the line stream and testing each line against a
few lightweight patterns instead of fixed column positions.

CPW restructured several Deer DAUs in 2024 (old DAUs 21/22/25 merged into
new 57; old 31/37 merged into new 56) -- that shows up here as some DAU
numbers only having data for part of the 2019-2025 range. That's real and
not a parsing gap; this script doesn't attempt to reconcile old/new DAU
numbers. Elk/Pronghorn/Bear may have their own such restructurings --
don't assume there isn't one just because it isn't documented here yet.

Note: DAU numbers are per-species, not globally unique -- Deer DAU '01'
and Elk DAU '01' are different herds that happen to share a number. The
species tag this script attaches (and the importer's (SeasonYear, Species,
DAU) key) is what keeps them apart.

Usage: python parse_herd_population.py <pdf_path> <species> <season_year> <out_jsonl_path>
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
    # Matched without the trailing 'S' -- some years misspell it "UNITES".
    start = None
    for i, line in enumerate(lines):
        if "GAME MANAGEMENT UNIT" in line.upper():
            start = i + 1
            break
    if start is None:
        raise ValueError("Could not find 'GAME MANAGEMENT UNIT(S)' header line")

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
        if "not in a dau" in candidate.lower():
            # Elk's trailing "99 / [Statewide Unmanaged /] eastern plains
            # units not in a DAU" catch-all -- a free-text description, not
            # a real GMU list, with an inconsistent number of trailing
            # fields across years (seen with 0, 1 and 2 of them). Detected
            # by this distinctive phrase rather than the DAU number, since
            # it's plausible another species' report files it under a
            # different number. Only ever seen as the last real row before
            # the footnotes, so stop rather than guess at its shape.
            break
        if GMU_LIST_RE.match(candidate):
            gmus = candidate
            i += 1
        else:
            # Usually "HerdName" alone with the GMU list on the next line,
            # but at least one row (Deer 2024's DAU 20) has them merged onto
            # one line by the extractor ("North Fork Gunnison River 53,63")
            # -- split off a trailing GMU-list-shaped run if present.
            combined = re.match(r"^(.*\D)\s+(\d[\d,\s]*)$", candidate)
            if combined and GMU_LIST_RE.match(combined.group(2)):
                herd_name = combined.group(1).strip()
                gmus = combined.group(2).strip()
                i += 1
            else:
                herd_name = candidate
                i += 1
                gmus = lines[i] if i < n else ""
                i += 1

        if not GMU_LIST_RE.match(gmus):
            # Not a real per-DAU row -- e.g. Elk's trailing "99 / eastern
            # plains units not in a DAU" catch-all, which has a free-text
            # description instead of a GMU list and an inconsistent number
            # of trailing fields (0, 1 or 2). Only ever seen as the last
            # real row before the footnotes, so stop rather than guess at
            # its shape.
            break

        population = lines[i] if i < n else ""
        i += 1
        ratio = lines[i] if i < n and NUMBER_RE.match(lines[i]) else None
        if ratio is not None:
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
    pdf_path, species, season_year, out_path = sys.argv[1:5]
    doc = pymupdf.open(pdf_path)
    text = doc[0].get_text()
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    records = parse_lines(lines)

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            rec["species"] = species
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(records)} DAU records -> {out_path}")


if __name__ == "__main__":
    main()
