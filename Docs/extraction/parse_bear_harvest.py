"""
Parses CPW's "YYYY Bear Harvest, Hunters, and Recreation Days by Hunt
Code" report into rows of: hunt_code, boars/sows, total harvest, total
rec days, total licenses sold, percent success.

Much simpler than the deer/pronghorn reports -- this one is a genuine
single-column table (not absolute-positioned text), so get_text() already
returns tokens in reading order. No coordinate reconstruction needed:
just scan the flat token stream and, whenever a token looks like a hunt
code, read off the 6 numbers that immediately follow it. The report's
trailing "Total" summary row is skipped automatically since "Total"
doesn't match the hunt-code pattern.

Usage: python parse_bear_harvest.py <pdf_path> <season_year> <out_jsonl_path>
"""
import sys
import json
import re
import pymupdf

HUNT_CODE_RE = re.compile(r"^[A-Z]{2}\d{3}[A-Z0-9]{2}[A-Z]\*?$")


def main():
    pdf_path, season_year, out_path = sys.argv[1:4]
    doc = pymupdf.open(pdf_path)

    tokens = []
    for page in doc:
        tokens.extend(page.get_text().split())

    records = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if HUNT_CODE_RE.match(tok) and i + 6 < len(tokens):
            nums = tokens[i + 1:i + 7]
            # The 6 fields following a hunt code are always: boars, sows,
            # total harvest, total rec days, total licenses sold, percent
            # success (ending in '%'). Guard against a false-positive match
            # (e.g. stray text) by requiring the 6th field to look like a
            # percentage -- real rows always end that way.
            if nums[5].endswith("%"):
                records.append({
                    "hunt_code": tok,
                    "sex1": nums[0],
                    "sex2": nums[1],
                    "total_harvest": nums[2],
                    "total_rec_days": nums[3],
                    "total_hunters": nums[4],
                    "percent_success": nums[5].rstrip("%"),
                })
                i += 7
                continue
        i += 1

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            rec["species"] = "bear"
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(records)} hunt code records from {doc.page_count} page(s) -> {out_path}")


if __name__ == "__main__":
    main()
