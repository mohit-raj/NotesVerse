/* One-click backup / restore of the whole app: every table in the database plus all uploaded files.
   Restore only adds or updates rows; it never deletes anything. Uploaded files live in the `uploads` folder: copy that folder too. */
const express = require("express");
const fs = require("fs");
const path = require("path");
const { uploadsDir } = require("../paths");
const db = require("../../db/index.js");
const router = express.Router();
// every table in the database, so the backup covers the whole app (notes, themes, Micro Plan, PYQ Bank, study log, sticky note...)
const allTables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const TABLES = { filter: (fn) => allTables().filter(fn) };
const exists = () => true;

/* ---- tiny ZIP writer/reader (no compression, so no extra packages are needed) ---- */
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function makeZip(entries) {
  const parts = [], central = []; let offset = 0;
  entries.forEach(({ name, data }) => {
    const nm = Buffer.from(name, "utf8"), crc = crc32(data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nm); offset += 30 + nm.length + data.length;
  });
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
function readZip(buf) {
  const out = []; let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8), size = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), el = buf.readUInt16LE(p + 28);
    if (method !== 0) throw new Error("This zip was not made by NotesVerse (it is compressed). Use a backup made from the Dashboard.");
    const name = buf.slice(p + 30, p + 30 + nl).toString("utf8"), start = p + 30 + nl + el;
    out.push({ name, data: buf.slice(start, start + size) }); p = start + size;
  }
  return out;
}
function snapshot() {
  const out = { app: "NotesVerse", version: 2, exportedAt: new Date().toISOString(), tables: {} };
  TABLES.filter(exists).forEach((t) => { out.tables[t] = db.prepare(`SELECT * FROM "${t}"`).all(); });
  return out;
}
function restoreTables(data) {
  if (!data || data.app !== "NotesVerse" || !data.tables) throw new Error("This is not a NotesVerse backup file.");
  let rows = 0;
  db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");
    TABLES.filter(exists).forEach((t) => {
      const info = db.prepare(`PRAGMA table_info("${t}")`).all(), cols = info.map((c) => c.name);
      const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      (data.tables[t] || []).forEach((r) => {
        const use = cols.filter((c) => r[c] !== undefined);
        if (!use.length) return;
        const ins = `INSERT INTO "${t}" (${use.map((c) => `"${c}"`).join(",")}) VALUES (${use.map(() => "?").join(",")})`;
        const upd = use.filter((c) => !pk.includes(c));
        // update in place (never REPLACE, which would delete the row and anything linked to it)
        const sql = pk.length && pk.every((c) => use.includes(c))
          ? ins + ` ON CONFLICT(${pk.map((c) => `"${c}"`).join(",")}) ` + (upd.length ? `DO UPDATE SET ${upd.map((c) => `"${c}"=excluded."${c}"`).join(",")}` : "DO NOTHING")
          : ins.replace("INSERT INTO", "INSERT OR IGNORE INTO");
        db.prepare(sql).run(...use.map((c) => r[c]));
        rows++;
      });
    });
  })();
  return rows;
}

/* Download: ONE zip with backup.json + every uploaded photo/PDF */
router.get("/backup/export", (req, res) => {
  const entries = [{ name: "backup.json", data: Buffer.from(JSON.stringify(snapshot())) }];
  let files = 0;
  try { fs.readdirSync(uploadsDir).forEach((f) => { const fp = path.join(uploadsDir, f); if (f !== ".gitkeep" && fs.statSync(fp).isFile()) { entries.push({ name: "uploads/" + f, data: fs.readFileSync(fp) }); files++; } }); } catch (e) { /* no uploads yet */ }
  const zip = makeZip(entries);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="notesverse-backup-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.setHeader("X-Backup-Files", String(files));
  res.send(zip);
});

/* Restore from that zip (adds/updates only, never deletes) */
router.post("/backup/restore-zip", express.raw({ type: "application/octet-stream", limit: "1gb" }), (req, res) => {
  try {
    const entries = readZip(req.body);
    const j = entries.find((e) => e.name === "backup.json");
    if (!j) return res.status(400).send("backup.json not found in this zip.");
    const rows = restoreTables(JSON.parse(j.data.toString("utf8")));
    let files = 0;
    entries.filter((e) => e.name.startsWith("uploads/")).forEach((e) => {
      const base = path.basename(e.name); if (!base || base.startsWith(".")) return;
      fs.writeFileSync(path.join(uploadsDir, base), e.data); files++;
    });
    res.json({ restored: rows, files });
  } catch (e) { res.status(400).send(e.message); }
});

router.post("/backup/restore", (req, res) => {
  try { res.json({ restored: restoreTables(req.body && req.body.data) }); } catch (e) { res.status(400).send(e.message); }
});
module.exports = router;
