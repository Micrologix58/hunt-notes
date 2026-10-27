"""
Parses a CPW "Post Draw Report" PDF (one hunt code per page -- e.g. the
1065-page Primary DEER report) into the same hunt_code/list/status shape
as parse_drawn_out.py, pulling just the "Drawn Out At" box (points/choice
required per category) and ignoring everything else on the page (quotas,
pre/post-draw applicant breakdowns by point level, etc. -- not needed for
"how many points to draw this GMU").

The page has multiple Res/NonRes/Unrestricted/Restricted header rows (one
per box: Pre-Draw Quotas, Post-Draw Successful, Drawn Out At, and the
bottom Pre/Post-Draw Applicants tables) -- the target is identified as
the one whose header sits ~15-20pt above a "Drawn Out At" label.

Usage: python parse_deer_recap.py <pdf_path> <species> <draw_type> <season_year> <out_jsonl_path> [start_page] [end_page]
"""
import sys
import json
import re
import pymupdf

PHRASE_GAP_PX = 3
# "# Drawn / Hunt Code / List" mini-table is in the top-left red box -- its
# exact Y position depends on the report's page orientation (185 for the
# portrait Deer/Pronghorn reports, ~204 for the landscape Bear report), so
# this is generous enough to cover both rather than tuned to one.
HUNT_CODE_BOX_Y_MAX = 230


def group_into_phrases(line_words):
    phrases = []
    cur_words, cur_start, prev_end = [], None, None
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


def find_hunt_code_and_list(words):
    # "# Drawn  Hunt Code  List" mini-table header, then one data row below it.
    header = [w for w in words if w[4] in ("Hunt", "Code", "List") and w[1] < HUNT_CODE_BOX_Y_MAX and w[0] < 250]
    if not any(w[4] == "Hunt" for w in header) or not any(w[4] == "List" for w in header):
        return None, None
    header_y = min(w[1] for w in header)
    hc_col_x = min(w[0] for w in header if w[4] == "Hunt")
    list_col_x = min(w[0] for w in header if w[4] == "List")
    data_row = [w for w in words if header_y + 5 < w[1] < header_y + 30]
    # Bound tightly between the Hunt Code and List column starts -- a wider
    # window sweeps in the adjacent "# Drawn" and quota-amount values.
    hc_words = sorted([w for w in data_row if hc_col_x - 5 <= w[0] < list_col_x - 8], key=lambda w: w[0])
    list_words = sorted([w for w in data_row if list_col_x - 5 <= w[0] < list_col_x + 30], key=lambda w: w[0])
    hunt_code = "".join(w[4] for w in hc_words) or None
    list_val = "".join(w[4] for w in list_words) or None
    return hunt_code, list_val


def find_total_quota(words):
    """'Total Quota / Amount' label (top-left red box, two lines) with its
    number directly below -- above 'Remaining Balance', the next label down."""
    amount_w = [w for w in words if w[4] == "Amount" and w[0] < 150 and w[1] < 150]
    if not amount_w:
        return None
    amount_y = amount_w[0][1]
    candidates = [w for w in words if w[0] < 150 and amount_y + 2 < w[1] < amount_y + 30
                  and re.match(r"^[\d,]+$", w[4])]
    return candidates[0][4] if candidates else None


def find_drawn_out_header(words):
    """The Res/NonRes/Res/NonRes/Unrestricted/Restricted header ~15-20pt
    directly above a 'Drawn Out At' label -- not any of the page's other
    matching header rows."""
    drawn_out_at_y = None
    for w in words:
        if w[4] == "Drawn" and w[0] > 400:
            nxt = [w2 for w2 in words if w2[1] == w[1] and 0 <= w2[0] - w[2] < 8 and w2[4] == "Out"]
            if nxt:
                drawn_out_at_y = w[1]
                break
    if drawn_out_at_y is None:
        return None

    candidates = [w for w in words if w[4] in ("Res", "NonRes", "Unrestricted", "Restricted")
                  and 10 < drawn_out_at_y - w[1] < 25]
    if len(candidates) < 6:
        return None
    header_y = candidates[0][1]
    row = sorted([w for w in candidates if abs(w[1] - header_y) < 3], key=lambda w: w[0])
    if len(row) < 6:
        return None
    labels = ["adult_res", "adult_nonres", "youth_res", "youth_nonres", "landowner_unrestricted", "landowner_restricted"]
    header_x = {labels[i]: row[i][0] for i in range(6)}
    return header_x, drawn_out_at_y


def nearest_category(x, header_x):
    return min(header_x.items(), key=lambda kv: abs(x - kv[1]))[0]


def parse_page(page):
    words = page.get_text("words")
    hunt_code, list_val = find_hunt_code_and_list(words)
    if not hunt_code:
        return None
    total_quota = find_total_quota(words)
    header = find_drawn_out_header(words)
    if not header:
        return {"huntCode": hunt_code, "list": list_val, "status": {}, "totalQuota": total_quota}
    header_x, start_y = header

    # This report's rows are much tighter than the compact Drawn Out At
    # report's (~20pt vs ~45pt between labels), so the status text's 2
    # lines sit within start_y +/- a few px, not +16 -- a wider window
    # bleeds into the next row ("# Drawn at Final Level"'s own values).
    status_words = [w for w in words if start_y - 6 <= w[1] <= start_y + 8 and w[0] >= header_x["adult_res"] - 20]
    lines = {}
    for w in status_words:
        line_key = round(w[1] / 4) * 4
        lines.setdefault(line_key, []).append(w)

    cell_parts = {}
    for line_key in sorted(lines.keys()):
        for sx, text in group_into_phrases(lines[line_key]):
            cat = nearest_category(sx, header_x)
            cell_parts.setdefault(cat, []).append(text)
    status = {cat: " ".join(parts) for cat, parts in cell_parts.items()}

    return {"huntCode": hunt_code, "list": list_val, "status": status, "totalQuota": total_quota}


def main():
    pdf_path, species, draw_type, season_year, out_path = sys.argv[1:6]
    start_page = int(sys.argv[6]) if len(sys.argv) > 6 else 1
    end_page = int(sys.argv[7]) if len(sys.argv) > 7 else None

    doc = pymupdf.open(pdf_path)
    end_page = end_page or doc.page_count
    records = []
    skipped = []
    errored = []
    for i in range(start_page - 1, end_page):
        try:
            rec = parse_page(doc[i])
        except Exception as e:
            errored.append((i + 1, str(e)))
            continue
        if rec:
            records.append(rec)
        else:
            skipped.append(i + 1)

    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            rec["species"] = species
            rec["drawType"] = draw_type
            rec["seasonYear"] = int(season_year)
            f.write(json.dumps(rec) + "\n")

    print(f"Parsed {len(records)} hunt code pages (of {end_page - start_page + 1} scanned) -> {out_path}")
    if skipped:
        print(f"Skipped {len(skipped)} pages with no hunt code found: {skipped[:20]}{'...' if len(skipped) > 20 else ''}")
    if errored:
        print(f"Errored on {len(errored)} pages: {errored[:20]}")


if __name__ == "__main__":
    main()
