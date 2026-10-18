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

function runMigrations(db) {
    dropLegacyMyHuntLeftoverColumns(db);
    addMyHuntPlansPreferencePoints(db);
    makeWalkInAreasGmuNullable(db);
    addWalkInAreasParcelCount(db);
}

module.exports = { runMigrations };
