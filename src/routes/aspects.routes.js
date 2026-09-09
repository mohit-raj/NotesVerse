const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/aspects", (req, res) => {
  const { microthemeId, label } = req.body;
  const id = uid();
  db.prepare("INSERT INTO aspects (id,microtheme_id,label,memorised) VALUES (?,?,?,0)").run(id, microthemeId, label);
  res.json({ id });
});

router.patch("/aspects/:id", (req, res) => {
  const { memorised, content, lastRecall } = req.body;
  if (memorised !== undefined) db.prepare("UPDATE aspects SET memorised=? WHERE id=?").run(memorised ? 1 : 0, req.params.id);
  if (content !== undefined) db.prepare("UPDATE aspects SET content=? WHERE id=?").run(content, req.params.id);
  if (lastRecall !== undefined) db.prepare("UPDATE aspects SET last_recall=? WHERE id=?").run(lastRecall, req.params.id);
  res.json({ ok: true });
});

router.delete("/aspects/:id", (req, res) => {
  db.prepare("DELETE FROM aspects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
