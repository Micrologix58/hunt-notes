// Fills in DeerPopulationEstimates.TagQuota by summing each DAU's GMUs'
// primary-draw hunt-code quotas, from Docs/extraction/draw_points_deer_primary_*.jsonl
// (produced by Docs/extraction/parse_deer_recap.py, which also pulls each
// hunt code's "Total Quota Amount" now -- see that script's totalQuota field).
//
// A DAU's GMU membership isn't stable across years (CPW's 2024 DAU
// restructuring, see schema.sql/README) -- each year is summed against
// *that year's own* GMU->DAU mapping (read back from the
// DeerPopulationEstimates rows already imported for that year), not a
// single fixed mapping, so a GMU that moved between DAUs still lands in
// the right one for each year.
//
// This is PRIMARY DRAW quota only -- it doesn't include secondary draw or
// leftover/OTC tags, so it undercounts "total tags issued" for units with
// meaningful secondary/leftover volume. Labelled as such in the UI.
//
// Idempotent: safe to re-run (recomputes and overwrites TagQuota for every
// year it has a source file for; years with no draw_points file are left
// untouched).
const fs = require("fs");
const path = require("path");
const db = require("../db");

const EXTRACTION_DIR = path.join(__dirname, "..", "Docs", "extraction");

function parseIntSafe(str) {
    if (str == null) return 0;
    const n = parseInt(String(str).replace(/,/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
}

// Hunt codes are 8 chars: [Species][Sex][GMU x3][Season x2][Method].
function gmuFromHuntCode(huntCode) {
    const code = huntCode.endsWith("*") ? huntCode.slice(0, -1) : huntCode;
    if (code.length !== 8) return null;
    const gmu = parseInt(code.slice(2, 5), 10);
    return Number.isNaN(gmu) ? null : gmu;
}

function buildGmuToDauMap(seasonYear) {
    const rows = db.prepare(`SELECT DAU, GMUs FROM DeerPopulationEstimates WHERE SeasonYear = ?`).all(seasonYear);
    const map = new Map();
    for (const row of rows) {
        for (const part of row.GMUs.split(",")) {
            const gmu = parseInt(part.trim(), 10);
            if (!Number.isNaN(gmu)) map.set(gmu, row.DAU);
        }
    }
    return map;
}

const updateQuotaStmt = db.prepare(
    `UPDATE DeerPopulationEstimates SET TagQuota = @tagQuota WHERE SeasonYear = @seasonYear AND DAU = @dau`
);

function importYear(seasonYear, filePath) {
    const gmuToDau = buildGmuToDauMap(seasonYear);
    if (gmuToDau.size === 0) {
        console.log(`(skip ${seasonYear}) no DeerPopulationEstimates rows for this year yet -- run import_deer_population.js first`);
        return 0;
    }

    const lines = fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    const dauTotals = new Map();
    let unmapped = 0;
    for (const line of lines) {
        const r = JSON.parse(line);
        const gmu = gmuFromHuntCode(r.huntCode);
        const dau = gmu != null ? gmuToDau.get(gmu) : null;
        if (!dau) { unmapped++; continue; }
        dauTotals.set(dau, (dauTotals.get(dau) || 0) + parseIntSafe(r.totalQuota));
    }

    const txn = db.transaction(() => {
        for (const [dau, total] of dauTotals) {
            updateQuotaStmt.run({ seasonYear, dau, tagQuota: total });
        }
    });
    txn();

    console.log(`TagQuota ${seasonYear}: ${dauTotals.size} DAUs updated from ${lines.length} hunt codes` +
        (unmapped ? ` (${unmapped} hunt codes had no matching GMU/DAU, skipped)` : ""));
    return dauTotals.size;
}

function main() {
    const years = [2021, 2022, 2023, 2024, 2025];
    for (const year of years) {
        const file = path.join(EXTRACTION_DIR, `draw_points_deer_primary_${year}.jsonl`);
        if (!fs.existsSync(file)) { console.log(`(skip ${year}) ${file} not found`); continue; }
        importYear(year, file);
    }
    console.log("Done.");
}

main();
