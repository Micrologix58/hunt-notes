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
        SeasonYear, SpeciesKey, IsTargeted, HasApplied,
        PrimaryChoice1HuntCode, PrimaryChoice2HuntCode, PrimaryDrawResult, PrimaryDrawnHuntCode,
        SecondaryChoiceHuntCode, SecondaryDrawResult, SecondaryDrawnHuntCode,
        Notes, UpdatedAt
    ) VALUES (
        @seasonYear, @speciesKey, @isTargeted, @hasApplied,
        @primaryChoice1HuntCode, @primaryChoice2HuntCode, @primaryDrawResult, @primaryDrawnHuntCode,
        @secondaryChoiceHuntCode, @secondaryDrawResult, @secondaryDrawnHuntCode,
        @notes, CURRENT_TIMESTAMP
    )
    ON CONFLICT (SeasonYear, SpeciesKey) DO UPDATE SET
        IsTargeted = excluded.IsTargeted,
        HasApplied = excluded.HasApplied,
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

        const defaults = defaultMyHuntPlan(seasonYear, speciesKey);
        const merged = { ...defaults, ...body, seasonYear, speciesKey };

        upsertMyHuntPlanStmt.run({
            seasonYear,
            speciesKey,
            isTargeted: merged.isTargeted ? 1 : 0,
            hasApplied: merged.hasApplied ? 1 : 0,
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

app.listen(PORT, () => {
    console.log(`Hunt Notes API listening on port ${PORT}`);
});
