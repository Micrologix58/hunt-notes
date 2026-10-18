// Loads Docs/extraction/{harvest,draw_points}_*.jsonl (produced by the
// Python coordinate-based parsers -- see Docs/extraction/parse_*.py) into
// HuntCodeHarvestStats and HuntCodeDrawPoints.
//
// Idempotent: upserts on each table's UNIQUE key, so re-running after
// re-parsing a corrected PDF, or adding a new species/year, never
// duplicates existing rows.
const fs = require("fs");
const path = require("path");
const db = require("../db");

const EXTRACTION_DIR = path.join(__dirname, "..", "Docs", "extraction");

// Hunt codes are 8 chars, self-describing: [Species][Sex][GMU x3][Season x2][Method]
// -- see the Big Game brochure's "Hunt codes contain a lot of information" page.
function decodeHuntCode(rawCode) {
    if (!rawCode) return null;
    const fewResponses = rawCode.endsWith("*");
    const code = fewResponses ? rawCode.slice(0, -1) : rawCode;
    if (code.length !== 8) return { code, fewResponses, gmu: null, sex: null, method: null, seasonCode: null };
    return {
        code,
        fewResponses,
        gmu: parseInt(code.slice(2, 5), 10) || null,
        sex: code[1],
        seasonCode: code.slice(5, 7),
        method: code[7],
    };
}

function readJsonl(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, "utf8").split("\n").map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
}

// Large values in these reports use comma-thousands formatting (e.g. Total
// Rec. Days can run into the thousands for a popular hunt code) --
// parseInt/parseFloat silently stop at the first comma otherwise, which
// would truncate "3,227" down to "3" rather than throwing.
function parseIntSafe(str) {
    if (str == null) return 0;
    const n = parseInt(String(str).replace(/,/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
}
function parseFloatSafe(str) {
    if (str == null) return 0;
    const n = parseFloat(String(str).replace(/,/g, ""));
    return Number.isNaN(n) ? 0 : n;
}

// "5 Pref Points" -> 5; anything else (Choice N, Leftover, No Apps, None
// Drawn, N/A) -> null, since it isn't a point count.
function parsePoints(status) {
    if (!status) return null;
    const m = status.match(/^(\d+)\s+Pref\s+Points$/);
    return m ? parseInt(m[1], 10) : null;
}

const upsertHarvestStmt = db.prepare(`
    INSERT INTO HuntCodeHarvestStats (
        SeasonYear, Species, HuntCode, GMU, Sex, Method, SeasonCode,
        AntleredCount, AntlerlessCount, YoungCount, TotalHarvest, TotalHunters,
        PercentSuccess, TotalRecDays, FewResponses
    ) VALUES (
        @seasonYear, @species, @huntCode, @gmu, @sex, @method, @seasonCode,
        @antleredCount, @antlerlessCount, @youngCount, @totalHarvest, @totalHunters,
        @percentSuccess, @totalRecDays, @fewResponses
    )
    ON CONFLICT (SeasonYear, Species, HuntCode) DO UPDATE SET
        GMU = excluded.GMU, Sex = excluded.Sex, Method = excluded.Method, SeasonCode = excluded.SeasonCode,
        AntleredCount = excluded.AntleredCount, AntlerlessCount = excluded.AntlerlessCount, YoungCount = excluded.YoungCount,
        TotalHarvest = excluded.TotalHarvest, TotalHunters = excluded.TotalHunters,
        PercentSuccess = excluded.PercentSuccess, TotalRecDays = excluded.TotalRecDays, FewResponses = excluded.FewResponses
`);

function importHarvestFile(filePath, species) {
    const rows = readJsonl(filePath);
    let n = 0;
    const txn = db.transaction(() => {
        for (const r of rows) {
            const decoded = decodeHuntCode(r.hunt_code);
            upsertHarvestStmt.run({
                seasonYear: r.seasonYear,
                species,
                huntCode: r.hunt_code,
                gmu: decoded.gmu,
                sex: decoded.sex,
                method: decoded.method,
                seasonCode: decoded.seasonCode,
                antleredCount: parseIntSafe(r.sex1),
                antlerlessCount: parseIntSafe(r.sex2),
                youngCount: parseIntSafe(r.sex3),
                totalHarvest: parseIntSafe(r.total_harvest),
                totalHunters: parseIntSafe(r.total_hunters),
                percentSuccess: parseFloatSafe(r.percent_success),
                totalRecDays: parseIntSafe(r.total_rec_days),
                fewResponses: decoded.fewResponses ? 1 : 0,
            });
            n++;
        }
    });
    txn();
    return n;
}

const upsertDrawPointsStmt = db.prepare(`
    INSERT INTO HuntCodeDrawPoints (
        SeasonYear, Species, DrawType, HuntCode, GMU, Sex, Method, SeasonCode, List,
        AdultResStatus, AdultResPoints, AdultNonResStatus, AdultNonResPoints,
        YouthResStatus, YouthResPoints, YouthNonResStatus, YouthNonResPoints,
        LandownerUnrestrictedStatus, LandownerRestrictedStatus
    ) VALUES (
        @seasonYear, @species, @drawType, @huntCode, @gmu, @sex, @method, @seasonCode, @list,
        @adultResStatus, @adultResPoints, @adultNonResStatus, @adultNonResPoints,
        @youthResStatus, @youthResPoints, @youthNonResStatus, @youthNonResPoints,
        @landownerUnrestrictedStatus, @landownerRestrictedStatus
    )
    ON CONFLICT (SeasonYear, Species, DrawType, HuntCode) DO UPDATE SET
        GMU = excluded.GMU, Sex = excluded.Sex, Method = excluded.Method, SeasonCode = excluded.SeasonCode, List = excluded.List,
        AdultResStatus = excluded.AdultResStatus, AdultResPoints = excluded.AdultResPoints,
        AdultNonResStatus = excluded.AdultNonResStatus, AdultNonResPoints = excluded.AdultNonResPoints,
        YouthResStatus = excluded.YouthResStatus, YouthResPoints = excluded.YouthResPoints,
        YouthNonResStatus = excluded.YouthNonResStatus, YouthNonResPoints = excluded.YouthNonResPoints,
        LandownerUnrestrictedStatus = excluded.LandownerUnrestrictedStatus,
        LandownerRestrictedStatus = excluded.LandownerRestrictedStatus
`);

function importDrawPointsFile(filePath) {
    const rows = readJsonl(filePath);
    let n = 0;
    const txn = db.transaction(() => {
        for (const r of rows) {
            const decoded = decodeHuntCode(r.huntCode);
            const s = r.status || {};
            upsertDrawPointsStmt.run({
                seasonYear: r.seasonYear,
                species: r.species,
                drawType: r.drawType,
                huntCode: decoded.code,
                gmu: decoded.gmu,
                sex: decoded.sex,
                method: decoded.method,
                seasonCode: decoded.seasonCode,
                list: r.list || null,
                adultResStatus: s.adult_res || null,
                adultResPoints: parsePoints(s.adult_res),
                adultNonResStatus: s.adult_nonres || null,
                adultNonResPoints: parsePoints(s.adult_nonres),
                youthResStatus: s.youth_res || null,
                youthResPoints: parsePoints(s.youth_res),
                youthNonResStatus: s.youth_nonres || null,
                youthNonResPoints: parsePoints(s.youth_nonres),
                landownerUnrestrictedStatus: s.landowner_unrestricted || null,
                landownerRestrictedStatus: s.landowner_restricted || null,
            });
            n++;
        }
    });
    txn();
    return n;
}

function main() {
    let total = 0;

    const harvestFiles = [
        ["harvest_deer_2025.jsonl", "deer"],
        ["harvest_bear_2025.jsonl", "bear"],
    ];
    for (const [file, species] of harvestFiles) {
        const p = path.join(EXTRACTION_DIR, file);
        if (!fs.existsSync(p)) { console.log(`(skip, not found) ${file}`); continue; }
        const n = importHarvestFile(p, species);
        console.log(`Harvest: ${n} rows from ${file}`);
        total += n;
    }

    const drawPointsFiles = [
        "draw_points_deer_primary_2025.jsonl",
        "draw_points_pronghorn_primary_2026.jsonl",
        "draw_points_pronghorn_secondary_2026.jsonl",
        "draw_points_bear_primary_2026.jsonl",
    ];
    for (const file of drawPointsFiles) {
        const p = path.join(EXTRACTION_DIR, file);
        if (!fs.existsSync(p)) { console.log(`(skip, not found) ${file}`); continue; }
        const n = importDrawPointsFile(p);
        console.log(`Draw points: ${n} rows from ${file}`);
        total += n;
    }

    console.log(`Done. ${total} rows imported/updated.`);
}

main();
