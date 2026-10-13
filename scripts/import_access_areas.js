// One-time (but safe to re-run) import of Access-tab reference data from
// Docs/extraction/access_areas.jsonl -- hand-transcribed from the scanned
// "2026 Colorado State Recreation Lands" PDF (no text layer).
//
// Idempotent: upserts on (Name, AreaType), and species rows are keyed
// (AccessAreaID, SpeciesName) with INSERT OR IGNORE, so re-running after
// fixing a typo in the source JSONL won't duplicate anything. Never
// touches a row's Notes column (the user's own field) on update.
const fs = require("fs");
const path = require("path");
const db = require("../db");

const file = path.join(__dirname, "..", "Docs", "extraction", "access_areas.jsonl");
const lines = fs.readFileSync(file, "utf8").split("\n").map(l => l.trim()).filter(Boolean);

const upsertArea = db.prepare(`
    INSERT INTO AccessAreas (Name, AreaType, County, GMUs, PrimaryGMU, AcresTotal, DistanceFromDenverMiles, Recreation, Facilities, CampingAllowed, Restrictions, SourcePage, UpdatedAt)
    VALUES (@name, @type, @county, @gmus, @primaryGmu, @acres, @dist, @recreation, @facilities, @camping, @restrictions, @page, CURRENT_TIMESTAMP)
    ON CONFLICT (Name, AreaType) DO UPDATE SET
        County = excluded.County,
        GMUs = excluded.GMUs,
        PrimaryGMU = excluded.PrimaryGMU,
        AcresTotal = excluded.AcresTotal,
        DistanceFromDenverMiles = excluded.DistanceFromDenverMiles,
        Recreation = excluded.Recreation,
        Facilities = excluded.Facilities,
        CampingAllowed = excluded.CampingAllowed,
        Restrictions = excluded.Restrictions,
        SourcePage = excluded.SourcePage,
        UpdatedAt = CURRENT_TIMESTAMP
`);
const getAreaId = db.prepare(`SELECT AccessAreaID FROM AccessAreas WHERE Name = ? AND AreaType = ?`);
const insertSpecies = db.prepare(`INSERT OR IGNORE INTO AccessAreaSpecies (AccessAreaID, SpeciesName) VALUES (?, ?)`);
const clearSpeciesNotIn = db.prepare(`DELETE FROM AccessAreaSpecies WHERE AccessAreaID = ? AND SpeciesName NOT IN (SELECT value FROM json_each(?))`);

function firstGmu(gmuText) {
    if (!gmuText) return null;
    const m = String(gmuText).match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}

let created = 0, updated = 0;
const txn = db.transaction(() => {
    for (const line of lines) {
        const rec = JSON.parse(line);
        const existing = getAreaId.get(rec.name, rec.type);

        upsertArea.run({
            name: rec.name,
            type: rec.type,
            county: rec.county || null,
            gmus: rec.gmus || null,
            primaryGmu: firstGmu(rec.gmus),
            acres: rec.acres == null ? null : rec.acres,
            dist: rec.dist == null ? null : rec.dist,
            recreation: rec.recreation || null,
            facilities: rec.facilities || null,
            camping: rec.camping ? 1 : 0,
            restrictions: rec.restrictions || null,
            page: rec.page == null ? null : rec.page,
        });

        const areaId = getAreaId.get(rec.name, rec.type).AccessAreaID;
        if (existing) updated++; else created++;

        const species = Array.isArray(rec.species) ? rec.species : [];
        clearSpeciesNotIn.run(areaId, JSON.stringify(species));
        for (const sp of species) insertSpecies.run(areaId, sp);
    }
});
txn();

console.log(`Access areas import done: ${created} created, ${updated} updated, ${lines.length} total records processed.`);
