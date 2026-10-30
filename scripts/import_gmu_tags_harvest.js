// Loads GMU-level tags-issued and harvest totals for species with no herd/
// DAU population survey (currently just Bear -- see sql/schema.sql's
// GmuTagsHarvest comment for why). Two independent sources, each upserted
// separately so a GMU/year missing one still keeps the other:
//
// - TagQuota: Docs/extraction/draw_points_<species>_primary_<year>.jsonl
//   (from Docs/extraction/parse_deer_recap.py), summing each hunt code's
//   totalQuota by the GMU decoded from its hunt code.
// - Harvest: either Docs/extraction/harvest_<species>_gmu_<year>.jsonl
//   (from Docs/extraction/parse_bear_harvest_by_gmu.py -- CPW's per-GMU
//   "for All Manners of Take" report, already summed, just needs the
//   "unit" field read as GMU directly) or
//   Docs/extraction/harvest_<species>_<year>.jsonl (from
//   Docs/extraction/parse_bear_harvest.py -- CPW's per-hunt-code "by Hunt
//   Code" report, summed here by GMU same as TagQuota) depending on
//   which report format that year's PDF used; checked in that order so a
//   year with both present prefers the already-summed GMU report.
//
// Idempotent: upserts on (SeasonYear, Species, GMU), only setting the
// field(s) the current run has a source for -- re-running after adding a
// new year/source never wipes out the other field already imported for
// that GMU/year.
const fs = require("fs");
const path = require("path");
const db = require("../db");

const EXTRACTION_DIR = path.join(__dirname, "..", "Docs", "extraction");

function parseIntSafe(str) {
    if (str == null) return 0;
    const n = parseInt(String(str).replace(/,/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
}

// Hunt codes are 8 chars: [Species][Sex][GMU x3][Season x2][Method].
function gmuFromHuntCode(huntCode) {
    if (!huntCode) return null;
    const code = huntCode.endsWith("*") ? huntCode.slice(0, -1) : huntCode;
    if (code.length !== 8) return null;
    const gmu = parseInt(code.slice(2, 5), 10);
    return Number.isNaN(gmu) ? null : gmu;
}

const upsertTagsStmt = db.prepare(`
    INSERT INTO GmuTagsHarvest (SeasonYear, Species, GMU, TagQuota)
    VALUES (@seasonYear, @species, @gmu, @tagQuota)
    ON CONFLICT (SeasonYear, Species, GMU) DO UPDATE SET TagQuota = excluded.TagQuota
`);
const upsertHarvestStmt = db.prepare(`
    INSERT INTO GmuTagsHarvest (SeasonYear, Species, GMU, Harvest)
    VALUES (@seasonYear, @species, @gmu, @harvest)
    ON CONFLICT (SeasonYear, Species, GMU) DO UPDATE SET Harvest = excluded.Harvest
`);

function importTags(species, seasonYear, filePath) {
    const rows = readJsonl(filePath);
    if (!rows) { console.log(`(skip, not found) tags for ${species} ${seasonYear}`); return 0; }

    const byGmu = new Map();
    for (const r of rows) {
        const gmu = gmuFromHuntCode(r.huntCode);
        if (gmu == null) continue;
        byGmu.set(gmu, (byGmu.get(gmu) || 0) + parseIntSafe(r.totalQuota));
    }
    const txn = db.transaction(() => {
        for (const [gmu, tagQuota] of byGmu) upsertTagsStmt.run({ seasonYear, species, gmu, tagQuota });
    });
    txn();
    console.log(`TagQuota ${species} ${seasonYear}: ${byGmu.size} GMUs from ${rows.length} hunt codes`);
    return byGmu.size;
}

// CPW's per-GMU "for All Manners of Take" report -- already summed by
// GMU, just read the unit/harvest fields directly.
function importHarvestByGmuFile(species, seasonYear, filePath) {
    const rows = readJsonl(filePath);
    if (!rows) return false;

    const txn = db.transaction(() => {
        for (const r of rows) {
            const gmu = parseInt(r.unit, 10);
            if (Number.isNaN(gmu)) continue;
            upsertHarvestStmt.run({ seasonYear, species, gmu, harvest: parseIntSafe(r.harvest) });
        }
    });
    txn();
    console.log(`Harvest ${species} ${seasonYear}: ${rows.length} GMUs from per-GMU report`);
    return true;
}

// CPW's per-hunt-code "by Hunt Code" report -- sum by the GMU decoded
// from each hunt code, same as TagQuota above.
function importHarvestByHuntCodeFile(species, seasonYear, filePath) {
    const rows = readJsonl(filePath);
    if (!rows) return false;

    const byGmu = new Map();
    for (const r of rows) {
        const gmu = gmuFromHuntCode(r.hunt_code);
        if (gmu == null) continue;
        byGmu.set(gmu, (byGmu.get(gmu) || 0) + parseIntSafe(r.total_harvest));
    }
    const txn = db.transaction(() => {
        for (const [gmu, harvest] of byGmu) upsertHarvestStmt.run({ seasonYear, species, gmu, harvest });
    });
    txn();
    console.log(`Harvest ${species} ${seasonYear}: ${byGmu.size} GMUs from ${rows.length} hunt codes (per-hunt-code report)`);
    return true;
}

function importHarvest(species, seasonYear) {
    const gmuFile = path.join(EXTRACTION_DIR, `harvest_${species}_gmu_${seasonYear}.jsonl`);
    if (importHarvestByGmuFile(species, seasonYear, gmuFile)) return;

    const huntCodeFile = path.join(EXTRACTION_DIR, `harvest_${species}_${seasonYear}.jsonl`);
    if (importHarvestByHuntCodeFile(species, seasonYear, huntCodeFile)) return;

    console.log(`(skip, not found) harvest for ${species} ${seasonYear}`);
}

// [species, tagsYears, harvestYears] -- the two lists don't have to match;
// each year is imported independently into whichever field(s) it has data for.
const SPECIES_YEARS = [
    ["bear", [2021, 2022, 2023, 2024, 2025, 2026], [2019, 2020, 2021, 2023, 2024, 2025]],
];

function main() {
    for (const [species, tagsYears, harvestYears] of SPECIES_YEARS) {
        for (const year of tagsYears) {
            importTags(species, year, path.join(EXTRACTION_DIR, `draw_points_${species}_primary_${year}.jsonl`));
        }
        for (const year of harvestYears) {
            importHarvest(species, year);
        }
    }
    console.log("Done.");
}

main();
