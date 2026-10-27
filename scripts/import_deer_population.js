// Loads Docs/extraction/population_deer_*.jsonl (produced by
// Docs/extraction/parse_deer_population.py, plus one hand-transcribed year
// -- see that script's docstring and README's "Updating Herd data"
// section) into DeerPopulationEstimates.
//
// Idempotent: upserts on (SeasonYear, DAU), and never touches TagQuota --
// that column comes from a different source and a different script
// (scripts/import_deer_tag_quotas.js, run separately after this one), so
// re-running this import never wipes it.
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
    INSERT INTO DeerPopulationEstimates (SeasonYear, DAU, HerdName, GMUs, PopulationEstimate, BuckDoeRatio)
    VALUES (@seasonYear, @dau, @herdName, @gmus, @population, @ratio)
    ON CONFLICT (SeasonYear, DAU) DO UPDATE SET
        HerdName = excluded.HerdName,
        GMUs = excluded.GMUs,
        PopulationEstimate = excluded.PopulationEstimate,
        BuckDoeRatio = excluded.BuckDoeRatio
`);

function importFile(filePath) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
    let n = 0;
    const txn = db.transaction(() => {
        for (const line of lines) {
            const r = JSON.parse(line);
            upsertStmt.run({
                seasonYear: r.seasonYear,
                // 2019/2020 print bare DAU numbers ('1'), 2021+ zero-pad them
                // ('01') -- normalize so the same DAU joins into one series
                // across years instead of splitting into two DAU keys.
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

function main() {
    const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
    let total = 0;
    for (const year of years) {
        const file = `population_deer_${year}.jsonl`;
        const p = path.join(EXTRACTION_DIR, file);
        if (!fs.existsSync(p)) { console.log(`(skip, not found) ${file}`); continue; }
        const n = importFile(p);
        console.log(`Population: ${n} rows from ${file}`);
        total += n;
    }
    console.log(`Done. ${total} rows imported/updated.`);
}

main();
