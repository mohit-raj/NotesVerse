const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "vault.sqlite3");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

/* --- lightweight migration for DBs created before photo_url existed --- */
const peopleCols = db.prepare("PRAGMA table_info(people)").all().map((c) => c.name);
if (!peopleCols.includes("photo_url")) {
  db.exec("ALTER TABLE people ADD COLUMN photo_url TEXT DEFAULT ''");
}

/* --- lightweight migration for DBs created before aspect content/recall existed --- */
const aspectCols = db.prepare("PRAGMA table_info(aspects)").all().map((c) => c.name);
if (!aspectCols.includes("content")) {
  db.exec("ALTER TABLE aspects ADD COLUMN content TEXT DEFAULT ''");
}
if (!aspectCols.includes("last_recall")) {
  db.exec("ALTER TABLE aspects ADD COLUMN last_recall TEXT DEFAULT ''");
}

module.exports = db;
