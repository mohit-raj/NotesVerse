const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/items", (req, res) => {
  const { sectionId, text, indent } = req.body;
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM items WHERE section_id=?").get(sectionId).m;
  db.prepare("INSERT INTO items (id,section_id,text,indent,sort_order) VALUES (?,?,?,?,?)").run(id, sectionId, text, indent ? 1 : 0, maxOrder + 1);
  res.json({ id });
});

router.patch("/items/:id", (req, res) => {
  if (req.body.text !== undefined) db.prepare("UPDATE items SET text=? WHERE id=?").run(req.body.text, req.params.id);
  if (req.body.indent !== undefined) db.prepare("UPDATE items SET indent=? WHERE id=?").run(Math.max(0, Math.min(2, req.body.indent | 0)), req.params.id);
  res.json({ ok: true });
});

router.delete("/items/:id", (req, res) => {
  db.prepare("DELETE FROM items WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
