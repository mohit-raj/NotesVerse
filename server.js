const path = require("path");
const fs = require("fs");
const app = require("./src/app");
const db = require("./db/index.js");
const { backupsDir, dbDir } = require("./src/paths");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NotesVerse running → http://localhost:${PORT}`);
});

/* ======================================================================
   Automatic background backups — no need to remember `npm run backup`.
   Runs once shortly after startup, then every 6 hours while the server
   is running. Keeps the most recent 40 auto-backups.
====================================================================== */
function autoBackup() {
  try {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    db.pragma("wal_checkpoint(FULL)");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = path.join(backupsDir, `auto-${stamp}.sqlite3`);
    fs.copyFileSync(path.join(dbDir, "vault.sqlite3"), dest);
    console.log(`Auto-backup saved: backups/auto-${stamp}.sqlite3`);

    const files = fs.readdirSync(backupsDir).filter((f) => f.startsWith("auto-")).sort();
    if (files.length > 40) {
      files.slice(0, files.length - 40).forEach((f) => fs.unlinkSync(path.join(backupsDir, f)));
    }
  } catch (e) {
    console.warn("Auto-backup skipped:", e.message);
  }
}
setTimeout(autoBackup, 15000); // first backup 15s after startup
setInterval(autoBackup, 6 * 60 * 60 * 1000); // then every 6 hours

/* ======================================================================
   Ensure every clean stop (Ctrl+C) flushes pending writes into
   vault.sqlite3 itself, so a plain copy of that one file is always
   a complete, safe backup.
====================================================================== */
function shutdown() {
  try {
    db.pragma("wal_checkpoint(FULL)");
    db.close();
  } catch (e) { /* ignore */ }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
