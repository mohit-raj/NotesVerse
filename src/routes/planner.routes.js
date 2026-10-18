const express = require("express");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");
const sync = require("../../db/planner-sync");

const router = express.Router();

const TRACKS = ["prelims", "mains", "ethics", "optional"];
const STATUSES = ["todo", "current", "done"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- read everything the planner page needs ---------- */
router.get("/planner", (req, res) => {
  const settings = {};
  db.prepare("SELECT key,value FROM plan_settings WHERE key IN ('examDate','mainsDate')")
    .all().forEach((r) => { settings[r.key] = r.value; });

  const tracks = {};
  TRACKS.forEach((t) => { tracks[t] = []; });
  const topicStmt = db.prepare("SELECT * FROM plan_topics WHERE subject_id=? ORDER BY sort_order");
  db.prepare("SELECT * FROM plan_subjects ORDER BY sort_order").all().forEach((s) => {
    if (!tracks[s.track]) return;
    tracks[s.track].push({
      id: s.id, name: s.name, status: s.status, doneOn: s.done_on || "",
      topics: topicStmt.all(s.id).map((t) => ({
        id: t.id, name: t.name, done: !!t.done, doneOn: t.done_on || "", microthemeId: t.microtheme_id || null
      }))
    });
  });

  const days = {};
  db.prepare("SELECT * FROM plan_days").all().forEach((d) => {
    days[d.date] = { note: d.note || "", tracks: {} };
  });
  db.prepare("SELECT * FROM plan_entries").all().forEach((e) => {
    if (!days[e.date]) days[e.date] = { note: "", tracks: {} };
    days[e.date].tracks[e.track] = { subject: e.subject || "", topic: e.topic || "", target: e.target || "", done: !!e.done };
  });

  res.json({ settings, tracks, days });
});

/* ---------- dates (prelims / mains target) ---------- */
router.patch("/planner/settings", (req, res) => {
  const set = db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES (?,?)");
  ["examDate", "mainsDate"].forEach((k) => {
    if (req.body[k] !== undefined) {
      const v = String(req.body[k] || "");
      if (v && !DATE_RE.test(v)) return;
      set.run(k, v);
    }
  });
  res.json({ ok: true });
});

/* ---------- subjects ---------- */
router.post("/planner/subjects", (req, res) => {
  const { track, name } = req.body;
  if (!TRACKS.includes(track) || !name || !String(name).trim()) return res.status(400).json({ error: "track and name required" });
  const id = uid();
  const max = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM plan_subjects WHERE track=?").get(track).m;
  db.transaction(() => {
    db.prepare("INSERT INTO plan_subjects (id,track,name,status,sort_order) VALUES (?,?,?, 'todo', ?)").run(id, track, String(name).trim(), max + 1);
    sync.linkSubject(db, id);
  })();
  res.json({ id });
});

router.patch("/planner/subjects/:id", (req, res) => {
  const subj = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(req.params.id);
  if (!subj) return res.status(404).json({ error: "not found" });
  const { name, status } = req.body;
  const tx = db.transaction(() => {
    if (name !== undefined && String(name).trim()) {
      db.prepare("UPDATE plan_subjects SET name=? WHERE id=?").run(String(name).trim(), subj.id);
      sync.onPlanSubjectRenamed(db, subj.id, String(name).trim());
    }
    if (status !== undefined) {
      if (!STATUSES.includes(status)) throw new Error("bad status");
      // Only one "current" subject per track.
      if (status === "current") db.prepare("UPDATE plan_subjects SET status='todo' WHERE track=? AND status='current'").run(subj.track);
      db.prepare("UPDATE plan_subjects SET status=?, done_on=? WHERE id=?").run(status, status === "done" ? localToday() : "", subj.id);
    }
  });
  try { tx(); } catch (e) { return res.status(400).json({ error: e.message }); }
  res.json({ ok: true });
});

router.post("/planner/subjects/:id/move-up", (req, res) => {
  const subj = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(req.params.id);
  if (!subj) return res.status(404).json({ error: "not found" });
  const list = db.prepare("SELECT id FROM plan_subjects WHERE track=? ORDER BY sort_order").all(subj.track).map((r) => r.id);
  const i = list.indexOf(subj.id);
  if (i > 0) {
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    const upd = db.prepare("UPDATE plan_subjects SET sort_order=? WHERE id=?");
    db.transaction(() => list.forEach((id, n) => upd.run(n, id)))();
  }
  res.json({ ok: true });
});

router.delete("/planner/subjects/:id", (req, res) => {
  db.prepare("DELETE FROM plan_subjects WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- topics ---------- */
// body: { names: ["..",".."] }  or  { microthemeId } to link an existing note
router.post("/planner/subjects/:id/topics", (req, res) => {
  const subj = db.prepare("SELECT id FROM plan_subjects WHERE id=?").get(req.params.id);
  if (!subj) return res.status(404).json({ error: "not found" });
  let rows = [];
  if (req.body.microthemeId) {
    const mt = db.prepare("SELECT id,name FROM microthemes WHERE id=?").get(req.body.microthemeId);
    if (!mt) return res.status(400).json({ error: "note not found" });
    rows = [{ name: mt.name, mtId: mt.id }];
  } else {
    rows = (Array.isArray(req.body.names) ? req.body.names : [])
      .map((n) => String(n || "").trim()).filter(Boolean).map((name) => ({ name, mtId: null }));
  }
  if (!rows.length) return res.status(400).json({ error: "nothing to add" });
  let max = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM plan_topics WHERE subject_id=?").get(subj.id).m;
  const ins = db.prepare("INSERT INTO plan_topics (id,subject_id,name,microtheme_id,sort_order) VALUES (?,?,?,?,?)");
  const ids = [];
  db.transaction(() => rows.forEach((r) => {
    const id = uid(); ids.push(id);
    ins.run(id, subj.id, r.name, r.mtId, ++max);
    sync.linkTopic(db, id); // finds or creates the matching microtheme
  }))();
  res.json({ ids });
});

router.patch("/planner/topics/:id", (req, res) => {
  const { name, done } = req.body;
  const topic = db.prepare("SELECT * FROM plan_topics WHERE id=?").get(req.params.id);
  if (!topic) return res.status(404).json({ error: "not found" });
  db.transaction(() => {
    if (name !== undefined && String(name).trim()) {
      db.prepare("UPDATE plan_topics SET name=? WHERE id=?").run(String(name).trim(), topic.id);
      sync.onPlanTopicRenamed(db, topic.id, String(name).trim());
    }
    if (done !== undefined) {
      db.prepare("UPDATE plan_topics SET done=?, done_on=? WHERE id=?").run(done ? 1 : 0, done ? localToday() : "", topic.id);
      // Finishing a topic counts as a revision of its microtheme, which
      // starts its spaced-repetition schedule. Unticking keeps history.
      if (done && !topic.done && topic.microtheme_id) sync.markRevised(db, topic.microtheme_id);
    }
  })();
  res.json({ ok: true });
});

router.post("/planner/topics/:id/move-up", (req, res) => {
  const t = db.prepare("SELECT * FROM plan_topics WHERE id=?").get(req.params.id);
  if (!t) return res.status(404).json({ error: "not found" });
  const list = db.prepare("SELECT id FROM plan_topics WHERE subject_id=? ORDER BY sort_order").all(t.subject_id).map((r) => r.id);
  const i = list.indexOf(t.id);
  if (i > 0) {
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    const upd = db.prepare("UPDATE plan_topics SET sort_order=? WHERE id=?");
    db.transaction(() => list.forEach((id, n) => upd.run(n, id)))();
  }
  res.json({ ok: true });
});

router.delete("/planner/topics/:id", (req, res) => {
  db.prepare("DELETE FROM plan_topics WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- one day's targets (saved whole) ---------- */
// body: { note, tracks: { prelims: {subject, topic, target, done}, ... } }
router.put("/planner/days/:date", (req, res) => {
  const date = req.params.date;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "bad date" });
  const note = String(req.body.note || "");
  const tracks = req.body.tracks || {};
  const upsertDay = db.prepare(`INSERT INTO plan_days (date,note,updated_at) VALUES (?,?,?)
    ON CONFLICT(date) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at`);
  const upsertEntry = db.prepare(`INSERT INTO plan_entries (date,track,subject,topic,target,done) VALUES (?,?,?,?,?,?)
    ON CONFLICT(date,track) DO UPDATE SET subject=excluded.subject, topic=excluded.topic, target=excluded.target, done=excluded.done`);
  db.transaction(() => {
    upsertDay.run(date, note, new Date().toISOString());
    TRACKS.forEach((t) => {
      const e = tracks[t];
      if (!e) return;
      upsertEntry.run(date, t, String(e.subject || ""), String(e.topic || ""), String(e.target || ""), e.done ? 1 : 0);
    });
  })();
  res.json({ ok: true });
});

module.exports = router;
