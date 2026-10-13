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

function runMigrations(db) {
    dropLegacyMyHuntLeftoverColumns(db);
}

module.exports = { runMigrations };
