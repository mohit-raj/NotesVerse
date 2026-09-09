const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

router.post("/people", (req, res) => {
  const { microthemeId, name, tag, photo } = req.body;
  if (!microthemeId || !name) return res.status(400).json({ error: "microthemeId and name required" });
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM people WHERE microtheme_id=?").get(microthemeId).m;
  db.prepare("INSERT INTO people (id,microtheme_id,name,tag,photo_url,sort_order) VALUES (?,?,?,?,?,?)")
    .run(id, microthemeId, name, tag || "", photo || "", maxOrder + 1);
  res.json({ id });
});

router.patch("/people/:id", (req, res) => {
  const { name, tag, photo } = req.body;
  if (name !== undefined) db.prepare("UPDATE people SET name=? WHERE id=?").run(name, req.params.id);
  if (tag !== undefined) db.prepare("UPDATE people SET tag=? WHERE id=?").run(tag, req.params.id);
  if (photo !== undefined) db.prepare("UPDATE people SET photo_url=? WHERE id=?").run(photo, req.params.id);
  res.json({ ok: true });
});

router.delete("/people/:id", (req, res) => {
  db.prepare("DELETE FROM people WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/people-bullets", (req, res) => {
  const { personId, text } = req.body;
  const id = uid();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM people_bullets WHERE person_id=?").get(personId).m;
  db.prepare("INSERT INTO people_bullets (id,person_id,text,sort_order) VALUES (?,?,?,?)").run(id, personId, text, maxOrder + 1);
  res.json({ id });
});

router.patch("/people-bullets/:id", (req, res) => {
  db.prepare("UPDATE people_bullets SET text=? WHERE id=?").run(req.body.text, req.params.id);
  res.json({ ok: true });
});

router.delete("/people-bullets/:id", (req, res) => {
  db.prepare("DELETE FROM people_bullets WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
