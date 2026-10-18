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

/* --- Micro Plan: link plan subjects to notes subjects (added later) --- */
const planSubjCols = db.prepare("PRAGMA table_info(plan_subjects)").all().map((c) => c.name);
if (!planSubjCols.includes("note_subject_id")) {
  db.exec("ALTER TABLE plan_subjects ADD COLUMN note_subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL");
}

/* --- Micro Plan: first-run starter subjects/topics, then link them to notes --- */
require("./planner-seed").seedPlanner(db);
// reset-notes.js sets NV_SKIP_SYNC so it sees the notes exactly as they were.
if (!process.env.NV_SKIP_SYNC) require("./planner-sync").backfill(db);

module.exports = db;
