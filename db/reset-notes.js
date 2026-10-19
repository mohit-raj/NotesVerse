/* `npm run reset-notes` — start the notes tree fresh.

   - Makes a backup in backups/ first.
   - Removes every notes subject, topic and page with all their content
     (sections, bullets, PYQs, aspects, revisions, time logged,
     attachment records).
   - Creates the standard subjects listed under "noteSubjects" in
     db/planner-seed.json, empty.
   - Keeps the Micro Plan subjects and removes all their subtopics (the
     subtopic list is shared with the notes). Each plan subject is put
     under its notes subject: "GS3 · Agriculture" creates the empty topic
     folder GS3 › Agriculture.
   - Keeps the sidebar sticky note and uploaded files on disk.
   Stop the server (Ctrl+C) before running it. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("./index.js");
const sync = require("./planner-sync");

db.pragma("wal_checkpoint(FULL)");
const backupsDir = path.join(__dirname, "..", "backups");
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
fs.copyFileSync(path.join(__dirname, "vault.sqlite3"), path.join(backupsDir, `before-reset-${stamp}.sqlite3`));
console.log(`Backup saved: backups/before-reset-${stamp}.sqlite3`);

let names = [];
try { names = JSON.parse(fs.readFileSync(path.join(__dirname, "planner-seed.json"), "utf8")).noteSubjects || []; } catch (e) { /* none */ }

const before = {
  subjects: db.prepare("SELECT COUNT(*) n FROM subjects").get().n,
  microthemes: db.prepare("SELECT COUNT(*) n FROM microthemes").get().n
};
db.transaction(() => {
  db.prepare("DELETE FROM subjects").run(); // cascades to microthemes and everything under them
  db.prepare("UPDATE plan_subjects SET note_subject_id=NULL, note_mode=NULL, note_topic_id=NULL, note_microtheme_id=NULL").run();
  // Subtopics are the same list on both sides, so they go from the plan too.
  db.prepare("DELETE FROM plan_topics").run();
  const ins = db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)");
  names.forEach((n, i) => ins.run(crypto.randomUUID(), n, i + 1));
  db.prepare("SELECT id FROM plan_subjects ORDER BY CASE track WHEN 'prelims' THEN 0 WHEN 'mains' THEN 1 WHEN 'ethics' THEN 2 ELSE 3 END, sort_order").all()
    .forEach((s) => sync.assignDefault(db, s.id)); // in plan order, so notes topics keep that order
})();
db.pragma("wal_checkpoint(FULL)");
console.log(`Removed ${before.subjects} subjects and ${before.microthemes} microthemes.`);
console.log(`Created ${names.length} subjects: ${names.join(", ")}`);
const tps = db.prepare("SELECT s.name sn, t.name tn FROM subject_topics t JOIN subjects s ON s.id=t.subject_id ORDER BY s.sort_order, t.sort_order").all();
if (tps.length) console.log("Topics from your plan: " + tps.map((r) => `${r.sn} › ${r.tn}`).join(", "));
console.log("Micro Plan subjects kept, subtopics cleared. Run `npm start`.");
db.close();
