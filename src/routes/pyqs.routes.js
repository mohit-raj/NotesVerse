const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/pyqs", (req, res) => {
  const { microthemeId, year, marks, question, aspect } = req.body;
  const id = uid();
  db.prepare("INSERT INTO pyqs (id,microtheme_id,year,marks,question,aspect) VALUES (?,?,?,?,?,?)")
    .run(id, microthemeId, Number(year) || 0, Number(marks) || 0, question || "", aspect || "");
  res.json({ id });
});

router.delete("/pyqs/:id", (req, res) => {
  db.prepare("DELETE FROM pyqs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
