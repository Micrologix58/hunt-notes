require("dotenv").config();

const express = require("express");
const cors = require("cors");

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4100;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ─── Home tab dashboard: draw calendar + season dates ─────────────────────
//
// One combined endpoint -- the Home tab needs all of this at once, and the
// dataset is tiny (a season's worth of dates), so there's no reason to
// split it into several round trips.

function latestSeasonYear() {
    const row = db.prepare(`
        SELECT MAX(y) AS year FROM (
            SELECT MAX(SeasonYear) AS y FROM DrawDates
            UNION ALL SELECT MAX(SeasonYear) FROM BigGameSeasonDates
            UNION ALL SELECT MAX(SeasonYear) FROM SmallGameSeasonDates
        )
    `).get();
    return row?.year ?? new Date().getFullYear();
}

const speciesStmt = db.prepare(`SELECT SpeciesID, SpeciesKey, DisplayName, Category, SortOrder FROM Species ORDER BY Category, SortOrder`);

const drawDatesStmt = db.prepare(`
    SELECT DrawType AS drawType, EventKey AS eventKey, EventLabel AS eventLabel,
           DisplayText AS displayText, SortOrder AS sortOrder, Notes AS notes
    FROM DrawDates
    WHERE SeasonYear = ?
    ORDER BY DrawType, SortOrder
`);

const bigGameSeasonsStmt = db.prepare(`
    SELECT s.SpeciesKey AS speciesKey, s.DisplayName AS speciesName,
           b.MethodKey AS methodKey, b.MethodLabel AS methodLabel,
           b.DisplayText AS displayText, b.SortOrder AS sortOrder, b.Notes AS notes
    FROM BigGameSeasonDates b
    JOIN Species s ON s.SpeciesID = b.SpeciesID
    WHERE b.SeasonYear = ?
    ORDER BY s.SortOrder, b.SortOrder
`);

const smallGameSeasonsStmt = db.prepare(`
    SELECT s.SpeciesKey AS speciesKey, s.DisplayName AS speciesName,
           g.SeasonLabel AS seasonLabel, g.DisplayText AS displayText,
           g.DailyBagLimit AS dailyBagLimit, g.PossessionLimit AS possessionLimit,
           g.AreaNote AS areaNote, g.SortOrder AS sortOrder
    FROM SmallGameSeasonDates g
    JOIN Species s ON s.SpeciesID = g.SpeciesID
    WHERE g.SeasonYear = ?
    ORDER BY s.SortOrder, g.SortOrder
`);

// GET /api/home/dashboard?year=2026 (defaults to latest year loaded)
app.get("/api/home/dashboard", (req, res) => {
    try {
        const seasonYear = req.query.year ? Number(req.query.year) : latestSeasonYear();

        res.json({
            success: true,
            data: {
                seasonYear,
                species: speciesStmt.all(),
                drawDates: drawDatesStmt.all(seasonYear),
                bigGameSeasons: bigGameSeasonsStmt.all(seasonYear),
                smallGameSeasons: smallGameSeasonsStmt.all(seasonYear),
            },
        });
    } catch (err) {
        console.error("GET /api/home/dashboard error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── My Hunt tab: personal application tracking ────────────────────────────

const MY_HUNT_SPECIES = ["deer", "elk", "pronghorn"];
const DRAW_RESULTS = ["pending", "drawn", "not_drawn"];

function defaultMyHuntPlan(seasonYear, speciesKey) {
    return {
        seasonYear, speciesKey,
        isTargeted: false, hasApplied: false,
        currentPreferencePoints: null,
        primaryChoice1HuntCode: "", primaryChoice2HuntCode: "",
        primaryDrawResult: "pending", primaryDrawnHuntCode: "",
        secondaryChoiceHuntCode: "",
        secondaryDrawResult: "pending", secondaryDrawnHuntCode: "",
        notes: "", updatedAt: null,
        leftoverPurchases: [],
    };
}

function rowToMyHuntPlan(row) {
    return {
        seasonYear: row.SeasonYear,
        speciesKey: row.SpeciesKey,
        isTargeted: !!row.IsTargeted,
        hasApplied: !!row.HasApplied,
        currentPreferencePoints: row.CurrentPreferencePoints,
        primaryChoice1HuntCode: row.PrimaryChoice1HuntCode ?? "",
        primaryChoice2HuntCode: row.PrimaryChoice2HuntCode ?? "",
        primaryDrawResult: row.PrimaryDrawResult,
        primaryDrawnHuntCode: row.PrimaryDrawnHuntCode ?? "",
        secondaryChoiceHuntCode: row.SecondaryChoiceHuntCode ?? "",
        secondaryDrawResult: row.SecondaryDrawResult,
        secondaryDrawnHuntCode: row.SecondaryDrawnHuntCode ?? "",
        notes: row.Notes ?? "",
        updatedAt: row.UpdatedAt,
    };
}

function rowToLeftoverPurchase(row) {
    return {
        id: row.MyHuntLeftoverPurchaseID,
        seasonYear: row.SeasonYear,
        speciesKey: row.SpeciesKey,
        huntCode: row.HuntCode ?? "",
        purchaseDate: row.PurchaseDate ?? "",
        notes: row.Notes ?? "",
    };
}

const getMyHuntPlanStmt = db.prepare(`SELECT * FROM MyHuntPlans WHERE SeasonYear = ? AND SpeciesKey = ?`);

const upsertMyHuntPlanStmt = db.prepare(`
    INSERT INTO MyHuntPlans (
        SeasonYear, SpeciesKey, IsTargeted, HasApplied, CurrentPreferencePoints,
        PrimaryChoice1HuntCode, PrimaryChoice2HuntCode, PrimaryDrawResult, PrimaryDrawnHuntCode,
        SecondaryChoiceHuntCode, SecondaryDrawResult, SecondaryDrawnHuntCode,
        Notes, UpdatedAt
    ) VALUES (
        @seasonYear, @speciesKey, @isTargeted, @hasApplied, @currentPreferencePoints,
        @primaryChoice1HuntCode, @primaryChoice2HuntCode, @primaryDrawResult, @primaryDrawnHuntCode,
        @secondaryChoiceHuntCode, @secondaryDrawResult, @secondaryDrawnHuntCode,
        @notes, CURRENT_TIMESTAMP
    )
    ON CONFLICT (SeasonYear, SpeciesKey) DO UPDATE SET
        IsTargeted = excluded.IsTargeted,
        HasApplied = excluded.HasApplied,
        CurrentPreferencePoints = excluded.CurrentPreferencePoints,
        PrimaryChoice1HuntCode = excluded.PrimaryChoice1HuntCode,
        PrimaryChoice2HuntCode = excluded.PrimaryChoice2HuntCode,
        PrimaryDrawResult = excluded.PrimaryDrawResult,
        PrimaryDrawnHuntCode = excluded.PrimaryDrawnHuntCode,
        SecondaryChoiceHuntCode = excluded.SecondaryChoiceHuntCode,
        SecondaryDrawResult = excluded.SecondaryDrawResult,
        SecondaryDrawnHuntCode = excluded.SecondaryDrawnHuntCode,
        Notes = excluded.Notes,
        UpdatedAt = CURRENT_TIMESTAMP
`);

const listLeftoverPurchasesStmt = db.prepare(`
    SELECT * FROM MyHuntLeftoverPurchases WHERE SeasonYear = ? AND SpeciesKey = ? ORDER BY MyHuntLeftoverPurchaseID
`);
const getLeftoverPurchaseStmt = db.prepare(`SELECT * FROM MyHuntLeftoverPurchases WHERE MyHuntLeftoverPurchaseID = ?`);
const insertLeftoverPurchaseStmt = db.prepare(`
    INSERT INTO MyHuntLeftoverPurchases (SeasonYear, SpeciesKey, HuntCode, PurchaseDate, Notes)
    VALUES (@seasonYear, @speciesKey, @huntCode, @purchaseDate, @notes)
`);
const updateLeftoverPurchaseStmt = db.prepare(`
    UPDATE MyHuntLeftoverPurchases SET HuntCode = @huntCode, PurchaseDate = @purchaseDate, Notes = @notes
    WHERE MyHuntLeftoverPurchaseID = @id
`);
const deleteLeftoverPurchaseStmt = db.prepare(`DELETE FROM MyHuntLeftoverPurchases WHERE MyHuntLeftoverPurchaseID = ?`);

// GET /api/my-hunt/plans?year=2027 -- always returns one entry per tracked
// species (deer/elk/pronghorn), defaulted blank if nothing's been saved yet,
// each with its list of leftover/OTC purchases (0 or more).
app.get("/api/my-hunt/plans", (req, res) => {
    try {
        const seasonYear = req.query.year ? Number(req.query.year) : new Date().getFullYear();
        if (!Number.isInteger(seasonYear)) {
            return res.status(400).json({ success: false, error: "year must be an integer" });
        }

        const data = MY_HUNT_SPECIES.map(speciesKey => {
            const row = getMyHuntPlanStmt.get(seasonYear, speciesKey);
            const plan = row ? rowToMyHuntPlan(row) : defaultMyHuntPlan(seasonYear, speciesKey);
            plan.leftoverPurchases = listLeftoverPurchasesStmt.all(seasonYear, speciesKey).map(rowToLeftoverPurchase);
            return plan;
        });

        res.json({ success: true, data });
    } catch (err) {
        console.error("GET /api/my-hunt/plans error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/my-hunt/plans/:speciesKey?year=2027 -- upserts the full row.
app.put("/api/my-hunt/plans/:speciesKey", (req, res) => {
    try {
        const speciesKey = String(req.params.speciesKey);
        const seasonYear = req.query.year ? Number(req.query.year) : new Date().getFullYear();

        if (!MY_HUNT_SPECIES.includes(speciesKey)) {
            return res.status(400).json({ success: false, error: `speciesKey must be one of: ${MY_HUNT_SPECIES.join(", ")}` });
        }
        if (!Number.isInteger(seasonYear)) {
            return res.status(400).json({ success: false, error: "year must be an integer" });
        }
        const body = req.body || {};
        if (body.primaryDrawResult && !DRAW_RESULTS.includes(body.primaryDrawResult)) {
            return res.status(400).json({ success: false, error: `primaryDrawResult must be one of: ${DRAW_RESULTS.join(", ")}` });
        }
        if (body.secondaryDrawResult && !DRAW_RESULTS.includes(body.secondaryDrawResult)) {
            return res.status(400).json({ success: false, error: `secondaryDrawResult must be one of: ${DRAW_RESULTS.join(", ")}` });
        }
        if (body.currentPreferencePoints != null && !Number.isInteger(body.currentPreferencePoints)) {
            return res.status(400).json({ success: false, error: "currentPreferencePoints must be an integer or null" });
        }

        const defaults = defaultMyHuntPlan(seasonYear, speciesKey);
        const merged = { ...defaults, ...body, seasonYear, speciesKey };

        upsertMyHuntPlanStmt.run({
            seasonYear,
            speciesKey,
            isTargeted: merged.isTargeted ? 1 : 0,
            hasApplied: merged.hasApplied ? 1 : 0,
            currentPreferencePoints: merged.currentPreferencePoints,
            primaryChoice1HuntCode: merged.primaryChoice1HuntCode || null,
            primaryChoice2HuntCode: merged.primaryChoice2HuntCode || null,
            primaryDrawResult: merged.primaryDrawResult,
            primaryDrawnHuntCode: merged.primaryDrawnHuntCode || null,
            secondaryChoiceHuntCode: merged.secondaryChoiceHuntCode || null,
            secondaryDrawResult: merged.secondaryDrawResult,
            secondaryDrawnHuntCode: merged.secondaryDrawnHuntCode || null,
            notes: merged.notes || null,
        });

        const saved = rowToMyHuntPlan(getMyHuntPlanStmt.get(seasonYear, speciesKey));
        saved.leftoverPurchases = listLeftoverPurchasesStmt.all(seasonYear, speciesKey).map(rowToLeftoverPurchase);
        res.json({ success: true, data: saved });
    } catch (err) {
        console.error("PUT /api/my-hunt/plans/:speciesKey error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/my-hunt/leftover-purchases -- add a leftover/OTC tag for a
// species/year. Unbounded: List A/B hunts can let you hold more than one
// tag for the same species in the same year (see schema.sql).
app.post("/api/my-hunt/leftover-purchases", (req, res) => {
    try {
        const body = req.body || {};
        const seasonYear = Number(body.seasonYear);
        const speciesKey = String(body.speciesKey || "");

        if (!MY_HUNT_SPECIES.includes(speciesKey)) {
            return res.status(400).json({ success: false, error: `speciesKey must be one of: ${MY_HUNT_SPECIES.join(", ")}` });
        }
        if (!Number.isInteger(seasonYear)) {
            return res.status(400).json({ success: false, error: "seasonYear must be an integer" });
        }

        const info = insertLeftoverPurchaseStmt.run({
            seasonYear,
            speciesKey,
            huntCode: body.huntCode || null,
            purchaseDate: body.purchaseDate || null,
            notes: body.notes || null,
        });

        const saved = rowToLeftoverPurchase(getLeftoverPurchaseStmt.get(info.lastInsertRowid));
        res.json({ success: true, data: saved });
    } catch (err) {
        console.error("POST /api/my-hunt/leftover-purchases error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/my-hunt/leftover-purchases/:id -- edit huntCode/purchaseDate/notes.
app.put("/api/my-hunt/leftover-purchases/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        const existing = getLeftoverPurchaseStmt.get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: "Leftover purchase not found" });
        }

        const body = req.body || {};
        updateLeftoverPurchaseStmt.run({
            id,
            huntCode: body.huntCode || null,
            purchaseDate: body.purchaseDate || null,
            notes: body.notes || null,
        });

        const saved = rowToLeftoverPurchase(getLeftoverPurchaseStmt.get(id));
        res.json({ success: true, data: saved });
    } catch (err) {
        console.error("PUT /api/my-hunt/leftover-purchases/:id error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/my-hunt/leftover-purchases/:id
app.delete("/api/my-hunt/leftover-purchases/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        deleteLeftoverPurchaseStmt.run(id);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/my-hunt/leftover-purchases/:id error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Access tab: SWA/STL hunting-access properties ─────────────────────────
//
// Reference data transcribed from the CPW State Recreation Lands brochure
// (see sql/schema.sql and scripts/import_access_areas.js) -- everything
// except Notes is read-only brochure fact; Notes is the user's own field.

function rowToAccessArea(row) {
    return {
        id: row.AccessAreaID,
        name: row.Name,
        areaType: row.AreaType,
        county: row.County ?? "",
        gmus: row.GMUs ?? "",
        primaryGmu: row.PrimaryGMU,
        acresTotal: row.AcresTotal,
        distanceFromDenverMiles: row.DistanceFromDenverMiles,
        recreation: row.Recreation ?? "",
        facilities: row.Facilities ?? "",
        campingAllowed: !!row.CampingAllowed,
        restrictions: row.Restrictions ?? "",
        notes: row.Notes ?? "",
        sourcePage: row.SourcePage,
        updatedAt: row.UpdatedAt,
        species: [],
    };
}

// GET /api/access-areas -- returns every SWA/STL property with its species
// list attached. One round trip; the dataset (~630 rows) is small enough
// that client-side sort/filter is simpler than paginating a reference table.
app.get("/api/access-areas", (req, res) => {
    try {
        const areas = db.prepare(`SELECT * FROM AccessAreas ORDER BY Name`).all().map(rowToAccessArea);
        const byId = new Map(areas.map(a => [a.id, a]));

        const speciesRows = db.prepare(`SELECT AccessAreaID, SpeciesName FROM AccessAreaSpecies ORDER BY SpeciesName`).all();
        for (const row of speciesRows) {
            const area = byId.get(row.AccessAreaID);
            if (area) area.species.push(row.SpeciesName);
        }

        res.json({ success: true, data: areas });
    } catch (err) {
        console.error("GET /api/access-areas error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/access-areas/species -- distinct species names, for the filter dropdown.
app.get("/api/access-areas/species", (req, res) => {
    try {
        const rows = db.prepare(`SELECT DISTINCT SpeciesName FROM AccessAreaSpecies ORDER BY SpeciesName`).all();
        res.json({ success: true, data: rows.map(r => r.SpeciesName) });
    } catch (err) {
        console.error("GET /api/access-areas/species error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const updateAccessAreaStmt = db.prepare(
    `UPDATE AccessAreas SET Notes = @notes, CampingAllowed = @campingAllowed, UpdatedAt = CURRENT_TIMESTAMP WHERE AccessAreaID = @id`
);
const getAccessAreaStmt = db.prepare(`SELECT * FROM AccessAreas WHERE AccessAreaID = ?`);

// PUT /api/access-areas/:id -- updates the user-editable fields: Notes and
// CampingAllowed. CampingAllowed starts out seeded from the brochure's own
// restriction text, but the brochure can be wrong, stale, or just not worth
// trusting for a day-access-only property -- so it's a correctable field
// like Notes, not a fixed fact. Everything else on the row (GMU, acres,
// species, etc.) stays brochure-sourced and read-only.
app.put("/api/access-areas/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        const existing = getAccessAreaStmt.get(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: "Access area not found" });
        }

        const body = req.body || {};
        const notes = "notes" in body ? body.notes : existing.Notes;
        const campingAllowed = "campingAllowed" in body ? !!body.campingAllowed : !!existing.CampingAllowed;

        updateAccessAreaStmt.run({ id, notes: notes || null, campingAllowed: campingAllowed ? 1 : 0 });
        res.json({ success: true, data: rowToAccessArea(getAccessAreaStmt.get(id)) });
    } catch (err) {
        console.error("PUT /api/access-areas/:id error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Draw Odds tab: harvest stats + draw points, joined by hunt code ──────
//
// One row per (Species, HuntCode), with harvest stats and primary/secondary
// draw points left-joined on -- nullable wherever that hunt code has no
// data in a given source (e.g. a hunt code with too few harvest-survey
// responses to estimate, or a species/year combo not yet imported).
// GMU/Sex/Method/SeasonCode are decoded from the hunt code itself at
// import time (see scripts/import_hunt_codes.js), so they're consistent
// across whichever source(s) a given code appears in.

const drawOddsStmt = db.prepare(`
    WITH AllCodes AS (
        SELECT DISTINCT Species, HuntCode FROM HuntCodeHarvestStats
        UNION
        SELECT DISTINCT Species, HuntCode FROM HuntCodeDrawPoints
    )
    SELECT
        ac.Species AS species,
        ac.HuntCode AS huntCode,
        COALESCE(h.GMU, dp.GMU, ds.GMU) AS gmu,
        COALESCE(h.Sex, dp.Sex, ds.Sex) AS sex,
        COALESCE(h.Method, dp.Method, ds.Method) AS method,
        COALESCE(h.SeasonCode, dp.SeasonCode, ds.SeasonCode) AS seasonCode,

        h.SeasonYear AS harvestYear, h.AntleredCount AS antleredCount, h.AntlerlessCount AS antlerlessCount,
        h.YoungCount AS youngCount, h.TotalHarvest AS totalHarvest, h.TotalHunters AS totalHunters,
        h.PercentSuccess AS percentSuccess, h.TotalRecDays AS totalRecDays, h.FewResponses AS fewResponses,

        dp.SeasonYear AS primaryYear, dp.List AS primaryList,
        dp.AdultResStatus AS primaryAdultResStatus, dp.AdultResPoints AS primaryAdultResPoints,
        dp.AdultNonResStatus AS primaryAdultNonResStatus, dp.AdultNonResPoints AS primaryAdultNonResPoints,
        dp.YouthResStatus AS primaryYouthResStatus, dp.YouthResPoints AS primaryYouthResPoints,
        dp.YouthNonResStatus AS primaryYouthNonResStatus, dp.YouthNonResPoints AS primaryYouthNonResPoints,
        dp.LandownerUnrestrictedStatus AS primaryLandownerUnrestrictedStatus,
        dp.LandownerRestrictedStatus AS primaryLandownerRestrictedStatus,

        ds.SeasonYear AS secondaryYear, ds.List AS secondaryList,
        ds.AdultResStatus AS secondaryAdultResStatus, ds.AdultResPoints AS secondaryAdultResPoints,
        ds.AdultNonResStatus AS secondaryAdultNonResStatus, ds.AdultNonResPoints AS secondaryAdultNonResPoints,
        ds.YouthResStatus AS secondaryYouthResStatus, ds.YouthResPoints AS secondaryYouthResPoints,
        ds.YouthNonResStatus AS secondaryYouthNonResStatus, ds.YouthNonResPoints AS secondaryYouthNonResPoints,
        ds.LandownerUnrestrictedStatus AS secondaryLandownerUnrestrictedStatus,
        ds.LandownerRestrictedStatus AS secondaryLandownerRestrictedStatus
    FROM AllCodes ac
    LEFT JOIN HuntCodeHarvestStats h ON h.Species = ac.Species AND h.HuntCode = ac.HuntCode
    LEFT JOIN HuntCodeDrawPoints dp ON dp.Species = ac.Species AND dp.HuntCode = ac.HuntCode AND dp.DrawType = 'primary'
    LEFT JOIN HuntCodeDrawPoints ds ON ds.Species = ac.Species AND ds.HuntCode = ac.HuntCode AND ds.DrawType = 'secondary'
    ORDER BY ac.Species, gmu, ac.HuntCode
`);

app.get("/api/draw-odds", (req, res) => {
    try {
        const rows = drawOddsStmt.all().map(r => ({
            ...r,
            fewResponses: !!r.fewResponses,
        }));
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/draw-odds error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Hunt Notes API listening on port ${PORT}`);
});
