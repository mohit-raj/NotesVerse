const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/quotes", (req, res) => {
  const { microthemeId, text } = req.body;
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM quotes WHERE microtheme_id=?").get(microthemeId).m;
  db.prepare("INSERT INTO quotes (id,microtheme_id,text,sort_order) VALUES (?,?,?,?)").run(id, microthemeId, text, maxOrder + 1);
  res.json({ id });
});

router.delete("/quotes/:id", (req, res) => {
  db.prepare("DELETE FROM quotes WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.patch("/quotes/:id", (req, res) => {
  db.prepare("UPDATE quotes SET text=? WHERE id=?").run(req.body.text, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
