const fs = require("fs");
const path = require("path");
const db = require("./index.js");

// Flush any pending writes into the main file first, so the copy is complete.
db.pragma("wal_checkpoint(FULL)");

const backupsDir = path.join(__dirname, "..", "backups");
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupsDir, `vault-${stamp}.sqlite3`);

fs.copyFileSync(path.join(__dirname, "vault.sqlite3"), dest);
console.log(`Backup saved: backups/vault-${stamp}.sqlite3`);

// Keep only the most recent 30 backups so this folder doesn't grow forever.
const files = fs.readdirSync(backupsDir).filter((f) => f.startsWith("vault-")).sort();
if (files.length > 30) {
  files.slice(0, files.length - 30).forEach((f) => fs.unlinkSync(path.join(backupsDir, f)));
}
