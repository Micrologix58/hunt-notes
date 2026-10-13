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

app.listen(PORT, () => {
    console.log(`Hunt Notes API listening on port ${PORT}`);
});
