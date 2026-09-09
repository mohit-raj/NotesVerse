const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/sections", (req, res) => {
  const { microthemeId, title } = req.body;
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM sections WHERE microtheme_id=?").get(microthemeId).m;
  db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,?)").run(id, microthemeId, title, maxOrder + 1);
  res.json({ id });
});

router.patch("/sections/:id", (req, res) => {
  const { title, starred } = req.body;
  if (title !== undefined) db.prepare("UPDATE sections SET title=? WHERE id=?").run(title, req.params.id);
  if (starred !== undefined) db.prepare("UPDATE sections SET starred=? WHERE id=?").run(starred ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete("/sections/:id", (req, res) => {
  db.prepare("DELETE FROM sections WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
