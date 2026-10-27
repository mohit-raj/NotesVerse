/* Themes: tags on PYQs, plus one free-writing bullet box per theme.
   - PYQs keep their text in the existing `pyqs` table; their tags live in a new `themes` column ("A, B").
   - theme_items holds the bullets/sub-bullets you write for a theme (keyed by the lower-case theme name). */
const express = require("express");
const crypto = require("crypto");
const db = require("../../db/index.js");
const router = express.Router();
const uid = () => crypto.randomUUID();

const cols = db.prepare("PRAGMA table_info(pyqs)").all().map((c) => c.name);
if (!cols.includes("themes")) {
  db.exec("ALTER TABLE pyqs ADD COLUMN themes TEXT DEFAULT ''");
  db.exec("UPDATE pyqs SET themes = aspect WHERE COALESCE(aspect,'') <> ''"); // old "aspect" tags become themes
}
db.exec(`CREATE TABLE IF NOT EXISTS theme_items (id TEXT PRIMARY KEY, theme TEXT NOT NULL, text TEXT NOT NULL, indent INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0);
         CREATE TABLE IF NOT EXISTS themes_meta (key TEXT PRIMARY KEY, name TEXT NOT NULL);`);

const key = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const split = (s) => String(s || "").split(",").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
const joinThemes = (arr) => { const seen = new Set(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }).join(", "); };

/* ---------- PYQs ---------- */
router.post("/pyqs", (req, res, next) => {
  // replaces the old handler: adds the themes column
  const { microthemeId, year, marks, question, themes } = req.body;
  const id = uid();
  db.prepare("INSERT INTO pyqs (id,microtheme_id,year,marks,question,aspect,themes) VALUES (?,?,?,?,?,?,?)")
    .run(id, microthemeId, Number(year) || 0, Number(marks) || 0, question || "", "", joinThemes(split(themes)));
  res.json({ id });
});
router.patch("/pyqs/:id", (req, res) => {
  const { year, marks, question, themes } = req.body;
  const row = db.prepare("SELECT * FROM pyqs WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  db.prepare("UPDATE pyqs SET year=?, marks=?, question=?, themes=? WHERE id=?").run(
    year !== undefined ? Number(year) || 0 : row.year, marks !== undefined ? Number(marks) || 0 : row.marks,
    question !== undefined ? question : row.question, themes !== undefined ? joinThemes(split(themes)) : row.themes, row.id);
  res.json({ ok: true });
});

/* ---------- themes ---------- */
router.get("/themes", (req, res) => {
  const map = new Map();
  const add = (name) => { const k = key(name); if (k && !map.has(k)) map.set(k, { key: k, name: String(name).trim(), items: [] }); return map.get(k); };
  db.prepare("SELECT themes FROM pyqs WHERE COALESCE(themes,'')<>''").all().forEach((r) => split(r.themes).forEach(add));
  db.prepare("SELECT name FROM themes_meta").all().forEach((r) => add(r.name));
  db.prepare("SELECT * FROM theme_items ORDER BY sort_order").all().forEach((r) => { const t = map.get(r.theme) || add(r.theme); t.items.push({ id: r.id, text: r.text, indent: r.indent }); });
  res.json([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
});
router.post("/themes", (req, res) => {
  const name = String(req.body.name || "").trim().replace(/,/g, " ");
  if (!name) return res.status(400).json({ error: "name required" });
  db.prepare("INSERT OR IGNORE INTO themes_meta (key,name) VALUES (?,?)").run(key(name), name);
  res.json({ key: key(name) });
});
router.post("/themes/rename", (req, res) => {
  const from = key(req.body.from), to = String(req.body.to || "").trim().replace(/,/g, " ");
  if (!from || !to) return res.status(400).json({ error: "names required" });
  db.transaction(() => {
    db.prepare("SELECT id,themes FROM pyqs WHERE COALESCE(themes,'')<>''").all().forEach((r) => {
      const parts = split(r.themes); if (!parts.some((p) => key(p) === from)) return;
      db.prepare("UPDATE pyqs SET themes=? WHERE id=?").run(joinThemes(parts.map((p) => (key(p) === from ? to : p))), r.id);
    });
    db.prepare("UPDATE theme_items SET theme=? WHERE theme=?").run(key(to), from);
    db.prepare("DELETE FROM themes_meta WHERE key=?").run(from);
    db.prepare("INSERT OR IGNORE INTO themes_meta (key,name) VALUES (?,?)").run(key(to), to);
  })();
  res.json({ key: key(to) });
});
router.delete("/themes/:key", (req, res) => {
  const k = key(req.params.key);
  db.transaction(() => {
    db.prepare("SELECT id,themes FROM pyqs WHERE COALESCE(themes,'')<>''").all().forEach((r) => {
      const parts = split(r.themes); if (parts.some((p) => key(p) === k)) db.prepare("UPDATE pyqs SET themes=? WHERE id=?").run(joinThemes(parts.filter((p) => key(p) !== k)), r.id);
    });
    db.prepare("DELETE FROM theme_items WHERE theme=?").run(k);
    db.prepare("DELETE FROM themes_meta WHERE key=?").run(k);
  })();
  res.json({ ok: true });
});

/* ---------- the bullets written under a theme ---------- */
router.post("/theme-items/paste", (req, res) => {
  try {
    const theme = key(req.body.theme), replaceId = req.body.replaceItemId;
    const items = [];
    (req.body.blocks || []).forEach((b) => (b.items || []).forEach((i) => { const t = String(i[0] || "").trim(); if (t) items.push([t, Math.max(0, Math.min(2, i[1] | 0))]); }));
    if (!theme) return res.status(400).send("theme required");
    db.transaction(() => {
      const cur = db.prepare("SELECT id FROM theme_items WHERE theme=? ORDER BY sort_order").all(theme).map((r) => r.id);
      const ids = items.map(() => uid());
      items.forEach(([t, ind], k) => db.prepare("INSERT INTO theme_items (id,theme,text,indent,sort_order) VALUES (?,?,?,?,?)").run(ids[k], theme, t, ind, 99999 + k));
      let order; const at = replaceId ? cur.indexOf(replaceId) : -1;
      if (at >= 0) { db.prepare("DELETE FROM theme_items WHERE id=?").run(replaceId); order = cur.slice(0, at).concat(ids, cur.slice(at + 1)); } else order = cur.concat(ids);
      order.forEach((id, k) => db.prepare("UPDATE theme_items SET sort_order=? WHERE id=?").run(k, id));
    })();
    res.json({ ok: true });
  } catch (e) { res.status(400).send(e.message); }
});
router.patch("/theme-items/:id", (req, res) => {
  if (req.body.text !== undefined) db.prepare("UPDATE theme_items SET text=? WHERE id=?").run(req.body.text, req.params.id);
  if (req.body.indent !== undefined) db.prepare("UPDATE theme_items SET indent=? WHERE id=?").run(Math.max(0, Math.min(2, req.body.indent | 0)), req.params.id);
  res.json({ ok: true });
});
router.delete("/theme-items/:id", (req, res) => { db.prepare("DELETE FROM theme_items WHERE id=?").run(req.params.id); res.json({ ok: true }); });

module.exports = router;
