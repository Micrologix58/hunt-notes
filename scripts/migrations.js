// Small, explicit, guarded migrations for shape changes that
// `CREATE TABLE IF NOT EXISTS` can't apply to an already-existing table.
// Each migration checks before it acts, so running this against a brand
// new database (nothing to migrate) or an already-migrated one is a no-op.

function hasTable(db, name) {
    return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function hasColumn(db, table, column) {
    return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

// MyHuntPlans originally had singular Leftover* columns (one leftover
// purchase per species per year). That didn't allow for List A/B hunts,
// which can let you hold more than one tag for the same species in the
// same year -- leftover purchases now live in their own
// MyHuntLeftoverPurchases table instead. Drop the old columns if present;
// any data in them predates that table and isn't migrated forward since
// this app has no users with real data in those columns yet.
function dropLegacyMyHuntLeftoverColumns(db) {
    if (!hasTable(db, "MyHuntPlans")) return;
    const legacyColumns = ["LeftoverHuntCode", "LeftoverPurchased", "LeftoverPurchaseDate", "LeftoverNotes"];
    for (const column of legacyColumns) {
        if (hasColumn(db, "MyHuntPlans", column)) {
            db.exec(`ALTER TABLE MyHuntPlans DROP COLUMN ${column}`);
            console.log(`Migration: dropped MyHuntPlans.${column} (superseded by MyHuntLeftoverPurchases).`);
        }
    }
}

// Adds the manually-entered preference-points field to an already-existing
// MyHuntPlans table (new installs get it straight from schema.sql's CREATE).
function addMyHuntPlansPreferencePoints(db) {
    if (!hasTable(db, "MyHuntPlans")) return;
    if (hasColumn(db, "MyHuntPlans", "CurrentPreferencePoints")) return;
    db.exec(`ALTER TABLE MyHuntPlans ADD COLUMN CurrentPreferencePoints INTEGER`);
    console.log("Migration: added MyHuntPlans.CurrentPreferencePoints.");
}

// WalkInAreas.GMU started NOT NULL, but a handful of western-slope atlas
// pages (e.g. Mesa County) don't overlay GMU boundary lines at all, so
// there's nothing to decode for those parcels. SQLite can't drop a NOT
// NULL constraint via ALTER TABLE -- drop and let schema.sql recreate it
// nullable; safe because this table only ever held the first Walk-In
// pass's reference data (GMU 103/109), reimported via
// scripts/import_walkin_areas.js, not user-entered data.
function makeWalkInAreasGmuNullable(db) {
    if (!hasTable(db, "WalkInAreas")) return;
    const gmuCol = db.prepare(`PRAGMA table_info(WalkInAreas)`).all().find(c => c.name === "GMU");
    if (!gmuCol || gmuCol.notnull === 0) return;
    db.exec(`DROP TABLE WalkInAreas`);
    console.log("Migration: dropped WalkInAreas to recreate GMU as nullable (re-run scripts/import_walkin_areas.js after this).");
}

// Adds the adjoining-shapes-per-row count to an already-existing
// WalkInAreas table (new installs get it straight from schema.sql's
// CREATE). Needed once statewide coverage moved from one row per shaded
// shape (GMU 103/109) to one row per cluster of shapes everywhere else.
function addWalkInAreasParcelCount(db) {
    if (!hasTable(db, "WalkInAreas")) return;
    if (hasColumn(db, "WalkInAreas", "ParcelCount")) return;
    db.exec(`ALTER TABLE WalkInAreas ADD COLUMN ParcelCount INTEGER NOT NULL DEFAULT 1`);
    console.log("Migration: added WalkInAreas.ParcelCount.");
}

// HuntCodeHarvestStats/HuntCodeDrawPoints.Species started CHECK'd to
// ('deer','elk','pronghorn'); adding bear needs 'bear' in that list. SQLite
// can't alter a CHECK constraint in place, so this rebuilds each table
// (rename, recreate with the new CHECK, copy rows across, drop the old
// one) -- unlike the WalkInAreas rebuilds above, these tables hold real
// imported harvest/draw-points data, so rows are carried forward, not
// dropped. Detects whether it's already been applied by checking the
// table's own CREATE TABLE sql for 'bear'.
function tableAllowsBearSpecies(db, table) {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table);
    return !!row && row.sql.includes("'bear'");
}

function addBearToHuntCodeHarvestStats(db) {
    if (!hasTable(db, "HuntCodeHarvestStats") || tableAllowsBearSpecies(db, "HuntCodeHarvestStats")) return;
    db.exec(`
        ALTER TABLE HuntCodeHarvestStats RENAME TO HuntCodeHarvestStats_old;
        CREATE TABLE HuntCodeHarvestStats (
            HuntCodeHarvestStatID INTEGER PRIMARY KEY,
            SeasonYear      INTEGER NOT NULL,
            Species         TEXT NOT NULL CHECK (Species IN ('deer', 'elk', 'pronghorn', 'bear')),
            HuntCode        TEXT NOT NULL,
            GMU             INTEGER,
            Sex             TEXT,
            Method          TEXT,
            SeasonCode      TEXT,
            AntleredCount   INTEGER,
            AntlerlessCount INTEGER,
            YoungCount      INTEGER,
            TotalHarvest    INTEGER,
            TotalHunters    INTEGER,
            PercentSuccess  REAL,
            TotalRecDays    INTEGER,
            FewResponses    INTEGER NOT NULL DEFAULT 0 CHECK (FewResponses IN (0, 1)),
            UNIQUE (SeasonYear, Species, HuntCode)
        );
        INSERT INTO HuntCodeHarvestStats (
            HuntCodeHarvestStatID, SeasonYear, Species, HuntCode, GMU, Sex, Method, SeasonCode,
            AntleredCount, AntlerlessCount, YoungCount, TotalHarvest, TotalHunters,
            PercentSuccess, TotalRecDays, FewResponses
        )
        SELECT
            HuntCodeHarvestStatID, SeasonYear, Species, HuntCode, GMU, Sex, Method, SeasonCode,
            AntleredCount, AntlerlessCount, YoungCount, TotalHarvest, TotalHunters,
            PercentSuccess, TotalRecDays, FewResponses
        FROM HuntCodeHarvestStats_old;
        DROP TABLE HuntCodeHarvestStats_old;
    `);
    console.log("Migration: added 'bear' to HuntCodeHarvestStats.Species, preserving existing rows.");
}

function addBearToHuntCodeDrawPoints(db) {
    if (!hasTable(db, "HuntCodeDrawPoints") || tableAllowsBearSpecies(db, "HuntCodeDrawPoints")) return;
    db.exec(`
        ALTER TABLE HuntCodeDrawPoints RENAME TO HuntCodeDrawPoints_old;
        CREATE TABLE HuntCodeDrawPoints (
            HuntCodeDrawPointID INTEGER PRIMARY KEY,
            SeasonYear  INTEGER NOT NULL,
            Species     TEXT NOT NULL CHECK (Species IN ('deer', 'elk', 'pronghorn', 'bear')),
            DrawType    TEXT NOT NULL CHECK (DrawType IN ('primary', 'secondary')),
            HuntCode    TEXT NOT NULL,
            GMU         INTEGER,
            Sex         TEXT,
            Method      TEXT,
            SeasonCode  TEXT,
            List        TEXT,
            AdultResStatus    TEXT,
            AdultResPoints    INTEGER,
            AdultNonResStatus TEXT,
            AdultNonResPoints INTEGER,
            YouthResStatus    TEXT,
            YouthResPoints    INTEGER,
            YouthNonResStatus TEXT,
            YouthNonResPoints INTEGER,
            LandownerUnrestrictedStatus TEXT,
            LandownerRestrictedStatus   TEXT,
            UNIQUE (SeasonYear, Species, DrawType, HuntCode)
        );
        INSERT INTO HuntCodeDrawPoints (
            HuntCodeDrawPointID, SeasonYear, Species, DrawType, HuntCode, GMU, Sex, Method, SeasonCode, List,
            AdultResStatus, AdultResPoints, AdultNonResStatus, AdultNonResPoints,
            YouthResStatus, YouthResPoints, YouthNonResStatus, YouthNonResPoints,
            LandownerUnrestrictedStatus, LandownerRestrictedStatus
        )
        SELECT
            HuntCodeDrawPointID, SeasonYear, Species, DrawType, HuntCode, GMU, Sex, Method, SeasonCode, List,
            AdultResStatus, AdultResPoints, AdultNonResStatus, AdultNonResPoints,
            YouthResStatus, YouthResPoints, YouthNonResStatus, YouthNonResPoints,
            LandownerUnrestrictedStatus, LandownerRestrictedStatus
        FROM HuntCodeDrawPoints_old;
        DROP TABLE HuntCodeDrawPoints_old;
    `);
    console.log("Migration: added 'bear' to HuntCodeDrawPoints.Species, preserving existing rows.");
}

// Same CHECK-constraint-can't-change-in-place problem as the HuntCode*
// tables above, for the My Hunt tab's own species lists. These two hold
// real user application data (not reference data reloaded from a file),
// so rows are carried forward exactly like the HuntCode* migrations.
function addBearToMyHuntPlans(db) {
    if (!hasTable(db, "MyHuntPlans") || tableAllowsBearSpecies(db, "MyHuntPlans")) return;
    db.exec(`
        ALTER TABLE MyHuntPlans RENAME TO MyHuntPlans_old;
        CREATE TABLE MyHuntPlans (
            MyHuntPlanID INTEGER PRIMARY KEY,
            SeasonYear   INTEGER NOT NULL,
            SpeciesKey   TEXT NOT NULL CHECK (SpeciesKey IN ('deer', 'elk', 'pronghorn', 'bear')),
            IsTargeted   INTEGER NOT NULL DEFAULT 0 CHECK (IsTargeted IN (0, 1)),
            HasApplied   INTEGER NOT NULL DEFAULT 0 CHECK (HasApplied IN (0, 1)),
            CurrentPreferencePoints INTEGER,
            PrimaryChoice1HuntCode TEXT,
            PrimaryChoice2HuntCode TEXT,
            PrimaryDrawResult      TEXT NOT NULL DEFAULT 'pending'
                CHECK (PrimaryDrawResult IN ('pending', 'drawn', 'not_drawn')),
            PrimaryDrawnHuntCode   TEXT,
            SecondaryChoiceHuntCode TEXT,
            SecondaryDrawResult     TEXT NOT NULL DEFAULT 'pending'
                CHECK (SecondaryDrawResult IN ('pending', 'drawn', 'not_drawn')),
            SecondaryDrawnHuntCode  TEXT,
            Notes     TEXT,
            UpdatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (SeasonYear, SpeciesKey)
        );
        INSERT INTO MyHuntPlans (
            MyHuntPlanID, SeasonYear, SpeciesKey, IsTargeted, HasApplied, CurrentPreferencePoints,
            PrimaryChoice1HuntCode, PrimaryChoice2HuntCode, PrimaryDrawResult, PrimaryDrawnHuntCode,
            SecondaryChoiceHuntCode, SecondaryDrawResult, SecondaryDrawnHuntCode,
            Notes, UpdatedAt
        )
        SELECT
            MyHuntPlanID, SeasonYear, SpeciesKey, IsTargeted, HasApplied, CurrentPreferencePoints,
            PrimaryChoice1HuntCode, PrimaryChoice2HuntCode, PrimaryDrawResult, PrimaryDrawnHuntCode,
            SecondaryChoiceHuntCode, SecondaryDrawResult, SecondaryDrawnHuntCode,
            Notes, UpdatedAt
        FROM MyHuntPlans_old;
        DROP TABLE MyHuntPlans_old;
    `);
    console.log("Migration: added 'bear' to MyHuntPlans.SpeciesKey, preserving existing rows.");
}

function addBearToMyHuntLeftoverPurchases(db) {
    if (!hasTable(db, "MyHuntLeftoverPurchases") || tableAllowsBearSpecies(db, "MyHuntLeftoverPurchases")) return;
    db.exec(`
        ALTER TABLE MyHuntLeftoverPurchases RENAME TO MyHuntLeftoverPurchases_old;
        CREATE TABLE MyHuntLeftoverPurchases (
            MyHuntLeftoverPurchaseID INTEGER PRIMARY KEY,
            SeasonYear   INTEGER NOT NULL,
            SpeciesKey   TEXT NOT NULL CHECK (SpeciesKey IN ('deer', 'elk', 'pronghorn', 'bear')),
            HuntCode     TEXT,
            PurchaseDate TEXT,
            Notes        TEXT,
            CreatedAt    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO MyHuntLeftoverPurchases (
            MyHuntLeftoverPurchaseID, SeasonYear, SpeciesKey, HuntCode, PurchaseDate, Notes, CreatedAt
        )
        SELECT
            MyHuntLeftoverPurchaseID, SeasonYear, SpeciesKey, HuntCode, PurchaseDate, Notes, CreatedAt
        FROM MyHuntLeftoverPurchases_old;
        DROP TABLE MyHuntLeftoverPurchases_old;
    `);
    console.log("Migration: added 'bear' to MyHuntLeftoverPurchases.SpeciesKey, preserving existing rows.");
}

function runMigrations(db) {
    dropLegacyMyHuntLeftoverColumns(db);
    addMyHuntPlansPreferencePoints(db);
    makeWalkInAreasGmuNullable(db);
    addWalkInAreasParcelCount(db);
    addBearToHuntCodeHarvestStats(db);
    addBearToHuntCodeDrawPoints(db);
    addBearToMyHuntPlans(db);
    addBearToMyHuntLeftoverPurchases(db);
}

module.exports = { runMigrations };
