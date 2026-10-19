const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");
const sync = require("../../db/planner-sync");

const router = express.Router();

router.post("/subjects", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM subjects").get().m;
  db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)").run(id, name, maxOrder + 1);
  // Plan subjects not in the notes yet may belong here (e.g. a new "GS4").
  db.prepare("SELECT id FROM plan_subjects WHERE note_subject_id IS NULL").all()
    .forEach((s) => { if (sync.defaultTarget(db, db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(s.id)) === id) sync.setTarget(db, s.id, id); });
  res.json({ id });
});

router.delete("/subjects/:id", (req, res) => {
  db.transaction(() => {
    sync.beforeNoteSubjectDeleted(db, req.params.id);
    db.prepare("DELETE FROM subjects WHERE id=?").run(req.params.id);
  })();
  res.json({ ok: true });
});

module.exports = router;
