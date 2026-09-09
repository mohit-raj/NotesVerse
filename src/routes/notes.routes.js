const express = require("express");
const db = require("../../db/index.js");

const router = express.Router();

router.get("/notes", (req, res) => {
  const row = db.prepare("SELECT content FROM dashboard_notes WHERE id='main'").get();
  res.json({ content: row ? row.content : "" });
});

router.patch("/notes", (req, res) => {
  const content = req.body.content || "";
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM dashboard_notes WHERE id='main'").get();
  if (existing) {
    db.prepare("UPDATE dashboard_notes SET content=?, updated_at=? WHERE id='main'").run(content, now);
  } else {
    db.prepare("INSERT INTO dashboard_notes (id,content,updated_at) VALUES ('main',?,?)").run(content, now);
  }
  res.json({ ok: true });
});

module.exports = router;
