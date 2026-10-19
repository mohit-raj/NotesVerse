const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");
const sync = require("../../db/planner-sync");

const router = express.Router();

/* Topics are the folders between a subject and its notes pages:
   Subject › Topic › page (e.g. GS3 › Internal Security › Cyber Security). */
router.post("/subject-topics", (req, res) => {
  const { subjectId, name } = req.body;
  if (!subjectId || !name || !String(name).trim()) return res.status(400).json({ error: "subjectId and name required" });
  if (!db.prepare("SELECT 1 FROM subjects WHERE id=?").get(subjectId)) return res.status(400).json({ error: "subject not found" });
  const id = uid();
  const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM subject_topics WHERE subject_id=?").get(subjectId).m;
  db.prepare("INSERT INTO subject_topics (id,subject_id,name,sort_order) VALUES (?,?,?,?)").run(id, subjectId, String(name).trim(), max + 1);
  res.json({ id });
});

router.patch("/subject-topics/:id", (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "name required" });
  db.transaction(() => {
    db.prepare("UPDATE subject_topics SET name=? WHERE id=?").run(name, req.params.id);
    sync.onNotesTopicRenamed(db, req.params.id, name);
  })();
  res.json({ ok: true });
});

// Deleting a topic keeps its pages: they move up to sit directly under the subject.
router.delete("/subject-topics/:id", (req, res) => {
  db.transaction(() => {
    sync.beforeNotesTopicDeleted(db, req.params.id);
    db.prepare("DELETE FROM subject_topics WHERE id=?").run(req.params.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
