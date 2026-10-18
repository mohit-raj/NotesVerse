const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");
const sync = require("../../db/planner-sync");

const router = express.Router();

router.post("/microthemes", (req, res) => {
  const { subjectId, name, tag } = req.body;
  if (!subjectId || !name) return res.status(400).json({ error: "subjectId and name required" });
  const id = uid();
  const maxOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order),0) m FROM microthemes WHERE subject_id=?")
    .get(subjectId).m;
  db.prepare("INSERT INTO microthemes (id,subject_id,name,tag,sort_order) VALUES (?,?,?,?,?)")
    .run(id, subjectId, name, tag || "", maxOrder + 1);
  db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,0)")
    .run(uid(), id, "Basics");
  sync.onMicrothemeCreated(db, id); // adds it as a topic in the Micro Plan if its subject is there
  res.json({ id });
});

router.patch("/microthemes/:id", (req, res) => {
  const { name, tag } = req.body;
  if (name !== undefined) {
    db.prepare("UPDATE microthemes SET name=? WHERE id=?").run(name, req.params.id);
    sync.onMicrothemeRenamed(db, req.params.id, name);
  }
  if (tag !== undefined) db.prepare("UPDATE microthemes SET tag=? WHERE id=?").run(tag, req.params.id);
  res.json({ ok: true });
});

router.delete("/microthemes/:id", (req, res) => {
  db.prepare("DELETE FROM microthemes WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/microthemes/:id/revise", (req, res) => {
  sync.markRevised(db, req.params.id);
  res.json({ ok: true });
});

router.post("/microthemes/:id/timelog", (req, res) => {
  const mtId = req.params.id;
  const minutes = Number(req.body.minutes) || 0;
  const today = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO time_log (id,microtheme_id,date,minutes) VALUES (?,?,?,?)").run(uid(), mtId, today, minutes);
  res.json({ ok: true });
});

router.delete("/microthemes/:id/timelog/:date", (req, res) => {
  db.prepare("DELETE FROM time_log WHERE microtheme_id=? AND date=?").run(req.params.id, req.params.date);
  res.json({ ok: true });
});

module.exports = router;
