// Creates the schema (if missing) and (re)loads the seed data.
// Run with: npm run db:init
const fs = require("fs");
const path = require("path");
const db = require("../db");

const schemaSql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
const seedSql = fs.readFileSync(path.join(__dirname, "..", "sql", "seed_2026.sql"), "utf8");

db.exec(schemaSql);
console.log("Schema applied.");

db.exec(seedSql);
console.log("Seed data (2026) loaded.");

console.log(`Database ready at ${db.name}`);
