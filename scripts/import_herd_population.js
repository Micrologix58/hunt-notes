// Loads Docs/extraction/population_<species>_*.jsonl (produced by
// Docs/extraction/parse_herd_population.py, plus hand-transcribed years for
// PDFs with unextractable fonts -- see that script's docstring and
// README's "Updating Herd data" section) into HerdPopulationEstimates.
//
// Idempotent: upserts on (SeasonYear, Species, DAU), and never touches
// TagQuota -- that column comes from a different source and a different
// script (scripts/import_herd_tag_quotas.js, run separately after this
// one), so re-running this import never wipes it.
const fs = require("fs");
const path = require("path");
const db = require("../db");

const EXTRACTION_DIR = path.join(__dirname, "..", "Docs", "extraction");

function parseIntSafe(str) {
    if (str == null) return null;
    const n = parseInt(String(str).replace(/,/g, ""), 10);
    return Number.isNaN(n) ? null : n;
}

const upsertStmt = db.prepare(`
    INSERT INTO HerdPopulationEstimates (SeasonYear, Species, DAU, HerdName, GMUs, PopulationEstimate, SexRatio)
    VALUES (@seasonYear, @species, @dau, @herdName, @gmus, @population, @ratio)
    ON CONFLICT (SeasonYear, Species, DAU) DO UPDATE SET
        HerdName = excluded.HerdName,
        GMUs = excluded.GMUs,
        PopulationEstimate = excluded.PopulationEstimate,
        SexRatio = excluded.SexRatio
`);

function importFile(filePath, species) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    let n = 0;
    const txn = db.transaction(() => {
        for (const line of lines) {
            const r = JSON.parse(line);
            upsertStmt.run({
                seasonYear: r.seasonYear,
                species,
                // Some years print bare DAU numbers ('1'), others zero-pad
                // them ('01') -- normalize so the same DAU joins into one
                // series across years instead of splitting into two keys.
                dau: String(r.dau).padStart(2, "0"),
                herdName: r.herdName || null,
                gmus: r.gmus,
                population: parseIntSafe(r.population),
                ratio: parseIntSafe(r.ratio),
            });
            n++;
        }
    });
    txn();
    return n;
}

// [species, years] -- add a species here once its population_<species>_<year>.jsonl
// files exist in Docs/extraction/.
const SPECIES_YEARS = [
    ["deer", [2019, 2020, 2021, 2022, 2023, 2024, 2025]],
    ["elk", [2019, 2020, 2021, 2022, 2023, 2024, 2025]],
    ["pronghorn", [2019, 2020, 2021, 2022, 2023, 2024, 2025]],
];

function main() {
    let total = 0;
    for (const [species, years] of SPECIES_YEARS) {
        for (const year of years) {
            const file = `population_${species}_${year}.jsonl`;
            const p = path.join(EXTRACTION_DIR, file);
            if (!fs.existsSync(p)) { console.log(`(skip, not found) ${file}`); continue; }
            const n = importFile(p, species);
            console.log(`Population: ${n} rows from ${file}`);
            total += n;
        }
    }
    console.log(`Done. ${total} rows imported/updated.`);
}

main();
