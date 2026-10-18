// One-time (but safe to re-run) import of Walk-In Atlas tab reference data
// from Docs/extraction/walkin_areas_*.jsonl -- hand-transcribed from CPW's
// "Regular Walk-In Atlas" PDF, which is pages of county maps (one raster
// image per page, no text layer over the shaded parcels) rather than a
// brochure with per-property text. Slug/Label/Locator are this app's own
// invention, read visually off the map -- see README's "Updating Walk-In
// Atlas data" section for how they were derived and how to add more.
//
// Idempotent: upserts on (SeasonYear, Slug). Never touches a row's Owner,
// Notes or Scouted columns (the user's own fields) on update.
const fs = require("fs");
const path = require("path");
const db = require("../db");

const EXTRACTION_DIR = path.join(__dirname, "..", "Docs", "extraction");

const upsertStmt = db.prepare(`
    INSERT INTO WalkInAreas (SeasonYear, Slug, Label, County, GMU, BigGame, LandType, Locator, SourcePage, UpdatedAt)
    VALUES (@seasonYear, @slug, @label, @county, @gmu, @bigGame, @landType, @locator, @sourcePage, CURRENT_TIMESTAMP)
    ON CONFLICT (SeasonYear, Slug) DO UPDATE SET
        Label = excluded.Label,
        County = excluded.County,
        GMU = excluded.GMU,
        BigGame = excluded.BigGame,
        LandType = excluded.LandType,
        Locator = excluded.Locator,
        SourcePage = excluded.SourcePage,
        UpdatedAt = CURRENT_TIMESTAMP
`);

function importFile(filePath) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    let n = 0;
    const txn = db.transaction(() => {
        for (const line of lines) {
            const rec = JSON.parse(line);
            upsertStmt.run({
                seasonYear: rec.seasonYear,
                slug: rec.slug,
                label: rec.label,
                county: rec.county,
                gmu: rec.gmu,
                bigGame: rec.bigGame ? 1 : 0,
                landType: rec.landType || null,
                locator: rec.locator || null,
                sourcePage: rec.sourcePage == null ? null : rec.sourcePage,
            });
            n++;
        }
    });
    txn();
    return n;
}

function main() {
    const files = ["walkin_areas_2026.jsonl"];
    let total = 0;
    for (const file of files) {
        const p = path.join(EXTRACTION_DIR, file);
        if (!fs.existsSync(p)) { console.log(`(skip, not found) ${file}`); continue; }
        const n = importFile(p);
        console.log(`Walk-In areas: ${n} rows from ${file}`);
        total += n;
    }
    console.log(`Done. ${total} rows imported/updated.`);
}

main();
