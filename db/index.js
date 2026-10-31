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

/* --- notes: microthemes can sit inside a topic (Subject › Topic › microtheme) --- */
const mtCols = db.prepare("PRAGMA table_info(microthemes)").all().map((c) => c.name);
if (!mtCols.includes("topic_id")) db.exec("ALTER TABLE microthemes ADD COLUMN topic_id TEXT REFERENCES subject_topics(id) ON DELETE SET NULL");

/* --- Micro Plan: columns that link plan items to the notes tree (added later) --- */
const planSubjCols = db.prepare("PRAGMA table_info(plan_subjects)").all().map((c) => c.name);
if (!planSubjCols.includes("note_subject_id")) db.exec("ALTER TABLE plan_subjects ADD COLUMN note_subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL");
if (!planSubjCols.includes("note_mode")) db.exec("ALTER TABLE plan_subjects ADD COLUMN note_mode TEXT");
if (!planSubjCols.includes("note_microtheme_id")) db.exec("ALTER TABLE plan_subjects ADD COLUMN note_microtheme_id TEXT REFERENCES microthemes(id) ON DELETE SET NULL");
if (!planSubjCols.includes("note_topic_id")) db.exec("ALTER TABLE plan_subjects ADD COLUMN note_topic_id TEXT REFERENCES subject_topics(id) ON DELETE SET NULL");
const planEntryCols = db.prepare("PRAGMA table_info(plan_entries)").all().map((c) => c.name);
if (planEntryCols.length && !planEntryCols.includes("done_topics")) db.exec("ALTER TABLE plan_entries ADD COLUMN done_topics TEXT DEFAULT ''");
const planTopicCols = db.prepare("PRAGMA table_info(plan_topics)").all().map((c) => c.name);
if (!planTopicCols.includes("section_id")) db.exec("ALTER TABLE plan_topics ADD COLUMN section_id TEXT REFERENCES sections(id) ON DELETE SET NULL");
// Links made by the earlier two-way version were subject-level.
db.exec("UPDATE plan_subjects SET note_mode='subject' WHERE note_subject_id IS NOT NULL AND note_mode IS NULL");

/* --- Micro Plan: first-run starter subjects/topics --- */
require("./planner-seed").seedPlanner(db);
/* --- Micro Plan: move an earlier layout (subtopics as sections) to topics --- */
require("./planner-sync").migrateToTopics(db);
/* --- Micro Plan: prelims subjects are plan-only (once; any notes pages they
   made are kept, the prelims subtopics just stop syncing) --- */
if (!db.prepare("SELECT 1 FROM plan_settings WHERE key='prelims_plan_only'").get()) {
  db.transaction(() => {
    db.prepare("UPDATE plan_topics SET microtheme_id=NULL WHERE subject_id IN (SELECT id FROM plan_subjects WHERE track='prelims')").run();
    db.prepare("UPDATE plan_subjects SET note_subject_id=NULL, note_mode=NULL, note_topic_id=NULL WHERE track='prelims'").run();
    db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES ('prelims_plan_only','1')").run();
  })();
}

module.exports = db;
