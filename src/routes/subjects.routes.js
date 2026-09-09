const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/subjects", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM subjects").get().m;
  db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)").run(id, name, maxOrder + 1);
  res.json({ id });
});

router.delete("/subjects/:id", (req, res) => {
  db.prepare("DELETE FROM subjects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
