// Fills in HerdPopulationEstimates.TagQuota by summing each DAU's GMUs'
// primary-draw hunt-code quotas, from
// Docs/extraction/draw_points_<species>_primary_*.jsonl (produced by
// Docs/extraction/parse_deer_recap.py, which also pulls each hunt code's
// "Total Quota Amount" -- see that script's totalQuota field; despite the
// filename, it's species-generic and already used for Deer/Bear/Elk Draw
// Odds data too).
//
// A DAU's GMU membership isn't stable across years (CPW's 2024 Deer DAU
// restructuring, see schema.sql/README) -- each year is summed against
// *that species and year's own* GMU->DAU mapping (read back from the
// HerdPopulationEstimates rows already imported for it), not a single
// fixed mapping, so a GMU that moved between DAUs still lands in the
// right one for each year.
//
// This is PRIMARY DRAW quota only -- it doesn't include secondary draw or
// leftover/OTC tags, so it undercounts "total tags issued" for units with
// meaningful secondary/leftover volume. Labelled as such in the UI.
//
// Idempotent: safe to re-run (recomputes and overwrites TagQuota for every
// species/year it has a source file for; years with no draw_points file
// are left untouched).
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

function buildGmuToDauMap(species, seasonYear) {
    const rows = db.prepare(`SELECT DAU, GMUs FROM HerdPopulationEstimates WHERE Species = ? AND SeasonYear = ?`).all(species, seasonYear);
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
    `UPDATE HerdPopulationEstimates SET TagQuota = @tagQuota WHERE SeasonYear = @seasonYear AND Species = @species AND DAU = @dau`
);

function importYear(species, seasonYear, filePath) {
    const gmuToDau = buildGmuToDauMap(species, seasonYear);
    if (gmuToDau.size === 0) {
        console.log(`(skip ${species} ${seasonYear}) no HerdPopulationEstimates rows for this species/year yet -- run import_herd_population.js first`);
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
            updateQuotaStmt.run({ seasonYear, species, dau, tagQuota: total });
        }
    });
    txn();

    console.log(`TagQuota ${species} ${seasonYear}: ${dauTotals.size} DAUs updated from ${lines.length} hunt codes` +
        (unmapped ? ` (${unmapped} hunt codes had no matching GMU/DAU, skipped)` : ""));
    return dauTotals.size;
}

// [species, years] -- add a species here once its
// draw_points_<species>_primary_<year>.jsonl files exist.
const SPECIES_YEARS = [
    ["deer", [2021, 2022, 2023, 2024, 2025]],
    ["elk", [2021, 2022, 2023, 2024, 2025]],
];

function main() {
    for (const [species, years] of SPECIES_YEARS) {
        for (const year of years) {
            const file = path.join(EXTRACTION_DIR, `draw_points_${species}_primary_${year}.jsonl`);
            if (!fs.existsSync(file)) { console.log(`(skip ${species} ${year}) ${file} not found`); continue; }
            importYear(species, year, file);
        }
    }
    console.log("Done.");
}

main();
