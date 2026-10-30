"""
Parses CPW's "Bear Harvest, Hunters and Recreation Days for All Manners of
Take" PDF -- a *different* report from the one parse_bear_harvest.py
handles ("...by Hunt Code"). This one is already aggregated by GMU/Unit
(summed across every hunt code/method for that unit), which is exactly
the shape needed for a GMU-level tags-vs-harvest comparison -- no hunt
code decoding required.

Despite looking like a simple linear table, get_text() scrambles the row
order: every 5th unit's row (005, 010, 015, ...) is emitted first in the
text stream, ahead of the title and the rest of the table, for reasons
that only matter insofar as they break naive line-by-line parsing (this
cost real debugging time before being traced to this). The actual
left-to-right, top-to-bottom row structure is still intact in each word's
coordinates, though -- so this parses via page.get_text("words") and
reconstructs rows from (x, y) rather than trusting extraction order:
column membership by nearest x-anchor (derived from the header row, not
hardcoded, so small position drift between years doesn't break it), row
membership by exact y (rows are programmatically laid out, so same-row
words share the exact same y to the point of float equality).

The "Total Hunters" and "Percent Success" columns print as headers but
are blank in every year seen so far (2019-2021, 2023-2024) -- this
report apparently never carried hunter-count data, only Boars/Sows/
Harvest/Rec Days. Harvest is all that's needed for the tags-vs-harvest
feature, so this isn't a gap worth chasing.

Usage: python parse_bear_harvest_by_gmu.py <pdf_path> <season_year> <out_jsonl_path>
"""
import sys
import json
import re
import pymupdf

UNIT_RE = re.compile(r"^\d{1,3}$")
NUM_RE = re.compile(r"^[\d,]+$")

# Header labels, in column order, used to derive x-anchors. "Harvest" and
# "Days" (not "Total"/"Rec.") are used since those words sit directly
# above their column's data, whereas "Total" repeats over multiple columns.
HEADER_LABELS = ["Unit", "Boars", "Sows", "Harvest", "Days", "Hunters", "Success"]
FIELD_NAMES = ["unit", "boars", "sows", "harvest", "recDays", "hunters", "success"]


def nearest_column(x, anchors):
    return min(range(len(anchors)), key=lambda i: abs(anchors[i] - x))


def parse_page(words, anchors):
    # Group into rows by exact y0 (programmatically laid out -- same-row
    # words share the identical float, so no tolerance needed), then
    # drop rows that aren't shaped like real data (title/header/footer
    # lines won't have a Unit-column token matching UNIT_RE).
    rows = {}
    for x0, y0, x1, y1, text, block, line, word in words:
        rows.setdefault(y0, []).append((x0, text))

    records = []
    for y0 in sorted(rows):
        row_words = sorted(rows[y0], key=lambda w: w[0])
        by_col = {}
        for x0, text in row_words:
            col = nearest_column(x0, anchors)
            by_col[FIELD_NAMES[col]] = text

        unit = by_col.get("unit")
        if not unit or not UNIT_RE.match(unit):
            continue
        if not all(NUM_RE.match(by_col[f]) for f in ("boars", "sows", "harvest", "recDays") if f in by_col):
            continue

        records.append({
            "unit": unit,
            "boars": by_col.get("boars"),
            "sows": by_col.get("sows"),
            "harvest": by_col.get("harvest"),
            "recDays": by_col.get("recDays"),
        })
    return records


def find_anchors(words):
    found = {}
    for x0, y0, x1, y1, text, block, line, word in words:
        if text in HEADER_LABELS and text not in found:
            found[text] = x0
    missing = [h for h in HEADER_LABELS if h not in found]
    if missing:
        raise ValueError(f"Could not find header label(s) {missing} to anchor columns")
    return [found[h] for h in HEADER_LABELS]


def main():
    pdf_path, season_year, out_path = sys.argv[1:4]
    doc = pymupdf.open(pdf_path)

    anchors = find_anchors(doc[0].get_text("words"))

    records = []
    seen_units = set()
    for page in doc:
        for rec in parse_page(page.get_text("words"), anchors):
            # Some years repeat the last page's final rows on the next
            # page's header continuation -- guard against double-counting
            # a unit rather than assuming each page is strictly disjoint.
            if rec["unit"] in seen_units:
                continue
            seen_units.add(rec["unit"])
            records.append(rec)

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            rec["species"] = "bear"
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(records)} unit records from {len(doc)} page(s) -> {out_path}")


if __name__ == "__main__":
    main()
