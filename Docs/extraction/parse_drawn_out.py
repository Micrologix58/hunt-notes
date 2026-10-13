"""
Parses a CPW "Drawn Out At Report" PDF (compact, ~10 hunt codes/page) into
rows of: hunt_code, list, category, status.

These reports use absolute-positioned text (not a real table), so
pdftotext's column-alignment heuristics badly scramble rows. This instead
works from raw word coordinates (pymupdf) and reconstructs each hunt
code's block by Y-position clustering. Within a block's status region,
words are grouped into PHRASES by horizontal gap (not assigned to a
column individually) before column-matching, since a two-word value like
"Choice 2" otherwise straddles the midpoint between two columns and gets
its words assigned to different columns.

Usage: python parse_drawn_out.py <pdf_path> <species> <draw_type> <season_year> <out_jsonl_path>
"""
import sys
import json
import pymupdf

PHRASE_GAP_PX = 3  # x-gap above which two words are treated as separate phrases/columns.
# Within-phrase gaps (e.g. "Choice"->"2", "No"->"Apps", "None"->"Drawn")
# measure ~2px; true between-column gaps measure ~4-14px depending on the
# report (as low as ~4.3px when a wide repeated value like "None Drawn"
# leaves little room before the next column) -- 3 is the threshold that
# reliably separates both without false-merging, across every report.


def find_header_x(words):
    candidates = [w for w in words if w[4] in ("Res", "NonRes", "Unrestricted", "Restricted") and w[1] < 170]
    if not candidates:
        return None
    header_y = min(w[1] for w in candidates)
    row = sorted([w for w in candidates if abs(w[1] - header_y) < 3], key=lambda w: w[0])
    if len(row) < 6:
        return None
    labels = ["adult_res", "adult_nonres", "youth_res", "youth_nonres", "landowner_unrestricted", "landowner_restricted"]
    return {labels[i]: row[i][0] for i in range(6)}, header_y


def nearest_category(x, header_x):
    return min(header_x.items(), key=lambda kv: abs(x - kv[1]))[0]


def group_into_phrases(line_words):
    """line_words: words on one sub-line, sorted by x. Returns list of (start_x, text)."""
    phrases = []
    cur_words, cur_start = [], None
    prev_end = None
    for w in sorted(line_words, key=lambda w: w[0]):
        if prev_end is not None and w[0] - prev_end > PHRASE_GAP_PX:
            phrases.append((cur_start, " ".join(cur_words)))
            cur_words, cur_start = [], None
        if cur_start is None:
            cur_start = w[0]
        cur_words.append(w[4])
        prev_end = w[2]
    if cur_words:
        phrases.append((cur_start, " ".join(cur_words)))
    return phrases


def parse_page(page):
    words = page.get_text("words")
    header = find_header_x(words)
    if not header:
        return []
    header_x, header_y = header

    drawn_out_at_starts = []
    for w in words:
        if w[4] == "Drawn" and w[0] < 230 and w[1] > header_y:
            nxt = [w2 for w2 in words if w2[1] == w[1] and 0 <= w2[0] - w[2] < 10]
            if any(n[4] == "Out" for n in nxt):
                drawn_out_at_starts.append(w[1])
    drawn_out_at_starts = sorted(set(drawn_out_at_starts))
    if not drawn_out_at_starts:
        return []

    records = []
    for idx, start_y in enumerate(drawn_out_at_starts):
        # Blocks are evenly spaced (~45pt apart); cap the last block on a
        # page the same way instead of leaving it open-ended, or it sweeps
        # up the page footer's disclaimer text into the hunt code/list.
        block_bottom = min(
            drawn_out_at_starts[idx + 1] if idx + 1 < len(drawn_out_at_starts) else 1e9,
            start_y + 46,
        )
        hc_lo = max(start_y, header_y + 5)  # never reach back into the header row

        hc_words = [w for w in words if hc_lo <= w[1] < block_bottom - 2 and 70 <= w[0] < 135]
        hunt_code = "".join(w[4] for w in sorted(hc_words, key=lambda w: (w[1], w[0]))) or None
        list_words = [w for w in words if hc_lo <= w[1] < block_bottom - 2 and 140 <= w[0] < 160]
        list_val = "".join(w[4] for w in sorted(list_words, key=lambda w: (w[1], w[0]))) or None

        # Status region: the (up to) 2 sub-lines right after "Drawn Out At",
        # before "# Drawn at Final Level" (~18pt below the block start).
        status_words = [w for w in words if start_y - 6 <= w[1] <= start_y + 16 and w[0] >= 320]
        lines = {}
        for w in status_words:
            line_key = round(w[1] / 4) * 4  # bucket sub-line rows that are a couple px apart
            lines.setdefault(line_key, []).append(w)

        cell_parts = {}
        for line_key in sorted(lines.keys()):
            for start_x, text in group_into_phrases(lines[line_key]):
                cat = nearest_category(start_x, header_x)
                cell_parts.setdefault(cat, []).append(text)
        status = {cat: " ".join(parts) for cat, parts in cell_parts.items()}

        if hunt_code:
            records.append({"huntCode": hunt_code, "list": list_val, "status": status})

    return records


def main():
    pdf_path, species, draw_type, season_year, out_path = sys.argv[1:6]
    doc = pymupdf.open(pdf_path)
    all_records = []
    for page in doc:
        all_records.extend(parse_page(page))

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in all_records:
            rec["species"] = species
            rec["drawType"] = draw_type
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(all_records)} hunt code records from {doc.page_count} pages -> {out_path}")


if __name__ == "__main__":
    main()
