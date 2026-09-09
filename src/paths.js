const path = require("path");
const fs = require("fs");

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dbDir = path.join(rootDir, "db");
const uploadsDir = path.join(rootDir, "uploads");
const backupsDir = path.join(rootDir, "backups");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

module.exports = { rootDir, publicDir, dbDir, uploadsDir, backupsDir };
