"""
Parses a CPW "Statewide Harvest Estimates" PDF's "...by Hunt Code" table
(one page type within the report -- found by locating the "Hunt Code"
header) into rows of: hunt_code, bucks/does/fawns (or equivalent sex
counts), total harvest, total hunters, percent success, total rec days.

Unlike the Drawn Out report, each row here is a single clean line with
well-separated single-token cells, so this only needs row (y) clustering
plus nearest-column-x matching -- no phrase grouping required.

Usage: python parse_harvest.py <pdf_path> <species> <season_year> <out_jsonl_path>
"""
import sys
import json
import re
import pymupdf

HUNT_CODE_RE = re.compile(r"^[A-Z]{2}\d{3}[A-Z0-9]{2}[A-Z]\*?$")


def find_table_pages(doc):
    """Pages whose header row contains 'Hunt' 'Code' 'Bucks' (or 'Bulls'/'Buck')."""
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if "by Hunt Code" in text and "Percent" in text and "Success" in text:
            pages.append(i)
    return pages


def find_header(words):
    hc = [w for w in words if w[4] == "Code" and w[0] < 100]
    if not hc:
        return None
    header_y = hc[0][1]
    row = [w for w in words if abs(w[1] - header_y) < 3]
    # Column anchors keyed by the last header word above each column (2nd
    # line of 2-line headers, e.g. "Harvest" under "Total").
    anchor_words = {"Bucks": "sex1", "Does": "sex2", "Fawns": "sex3",
                    "Harvest": "total_harvest", "Hunters": "total_hunters",
                    "Success": "percent_success", "Days": "total_rec_days"}
    cols = {}
    for w in row:
        if w[4] in anchor_words:
            cols[anchor_words[w[4]]] = w[0]
    if len(cols) < 6:
        return None
    return cols, header_y


def nearest_col(x, cols):
    return min(cols.items(), key=lambda kv: abs(x - kv[1]))[0]


def parse_page(page):
    words = page.get_text("words")
    header = find_header(words)
    if not header:
        return []
    cols, header_y = header

    rows = {}
    for w in words:
        if w[1] <= header_y + 5:
            continue
        if w[0] < 100 and HUNT_CODE_RE.match(w[4]):
            rows.setdefault(round(w[1]), {})["hunt_code"] = w[4]
        elif w[0] >= 100:
            row_y = round(w[1])
            rows.setdefault(row_y, {})
            col = nearest_col(w[0], cols)
            rows[row_y][col] = w[4]

    records = []
    for row_y in sorted(rows.keys()):
        r = rows[row_y]
        if "hunt_code" not in r:
            continue  # stray text that landed in the table's y-band (e.g. footnote)
        records.append(r)
    return records


def main():
    pdf_path, species, season_year, out_path = sys.argv[1:5]
    doc = pymupdf.open(pdf_path)
    table_pages = find_table_pages(doc)
    all_records = []
    for i in table_pages:
        all_records.extend(parse_page(doc[i]))

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in all_records:
            rec["species"] = species
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(all_records)} hunt code records from {len(table_pages)} table page(s) "
          f"(of {doc.page_count} total) -> {out_path}")


if __name__ == "__main__":
    main()
