/* `npm run reset-notes` — empties the notes tree (every subject and
   microtheme, with their sections, bullets, PYQs, aspects, revisions,
   time logged and attachment records) so you can start fresh.

   - Makes a backup in backups/ first.
   - Keeps the Micro Plan. On the next `npm start` every plan subject and
     topic is re-created in the notes tree, so the two start in sync.
   - Keeps the sidebar sticky note and uploaded files on disk.
   Stop the server (Ctrl+C) before running it. */
const fs = require("fs");
const path = require("path");
process.env.NV_SKIP_SYNC = "1";
const db = require("./index.js");

db.pragma("wal_checkpoint(FULL)");
const backupsDir = path.join(__dirname, "..", "backups");
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupsDir, `before-reset-${stamp}.sqlite3`);
fs.copyFileSync(path.join(__dirname, "vault.sqlite3"), dest);
console.log(`Backup saved: backups/before-reset-${stamp}.sqlite3`);

const before = {
  subjects: db.prepare("SELECT COUNT(*) n FROM subjects").get().n,
  microthemes: db.prepare("SELECT COUNT(*) n FROM microthemes").get().n
};
db.transaction(() => {
  db.prepare("DELETE FROM subjects").run(); // cascades to microthemes and everything under them
  db.prepare("UPDATE plan_subjects SET note_subject_id=NULL").run();
  db.prepare("UPDATE plan_topics SET microtheme_id=NULL").run();
  db.prepare("DELETE FROM plan_settings WHERE key='notes_synced'").run();
})();
db.pragma("wal_checkpoint(FULL)");
console.log(`Removed ${before.subjects} subjects and ${before.microthemes} microthemes. Micro Plan kept.`);
console.log("Run `npm start` — your plan subjects and topics will be added to the notes tree.");
db.close();
