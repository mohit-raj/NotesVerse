/* PYQ Bank (subject-wise). Questions from UPSC CSE / CDS / CAPF, grouped by subject -> subtopic.
   Own tables (pq2_*). Older PYQ tables, if you have them, are left alone. */
const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");

const router = express.Router();

db.exec(`
CREATE TABLE IF NOT EXISTS pq2_questions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  exam TEXT NOT NULL,
  year INTEGER NOT NULL,
  session TEXT DEFAULT '',
  qno INTEGER NOT NULL,
  subtopic TEXT DEFAULT '',
  stem TEXT DEFAULT '',
  opt_a TEXT DEFAULT '', opt_b TEXT DEFAULT '', opt_c TEXT DEFAULT '', opt_d TEXT DEFAULT '',
  correct TEXT DEFAULT '',
  explanation TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  flagged INTEGER DEFAULT 0,
  techniques TEXT DEFAULT '[]',
  my_answer TEXT DEFAULT '',
  attempted_at TEXT DEFAULT '',
  attempt_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  UNIQUE (subject, exam, year, session, qno)
);
CREATE INDEX IF NOT EXISTS idx_pq2_sub ON pq2_questions(subject, subtopic);
CREATE TABLE IF NOT EXISTS pq2_meta (k TEXT PRIMARY KEY, v TEXT);
`);
// my own words: technique that worked + trap (added later, so add the columns if missing)
{
  const cols = db.prepare("PRAGMA table_info(pq2_questions)").all().map((c) => c.name);
  if (!cols.includes("tech_txt")) db.exec("ALTER TABLE pq2_questions ADD COLUMN tech_txt TEXT DEFAULT ''");
  if (!cols.includes("trap_txt")) db.exec("ALTER TABLE pq2_questions ADD COLUMN trap_txt TEXT DEFAULT ''");
}
// technique and trap are now one box: fold any earlier trap text into the technique text
db.exec("UPDATE pq2_questions SET tech_txt = CASE WHEN COALESCE(tech_txt,'')='' THEN trap_txt ELSE tech_txt || ', ' || trap_txt END, trap_txt='' WHERE COALESCE(trap_txt,'')<>''");

/* ---- first run: load the starter Polity set (664 questions) once ---- */
function seedOnce(flag, file) {
  if (db.prepare("SELECT 1 FROM pq2_meta WHERE k=?").get(flag)) return;
  const fp = path.join(__dirname, "../../db", file);
  if (fs.existsSync(fp)) {
    try {
      const list = JSON.parse(fs.readFileSync(fp, "utf8"));
      const ins = db.prepare(`INSERT OR IGNORE INTO pq2_questions
        (id,subject,exam,year,session,qno,subtopic,stem,opt_a,opt_b,opt_c,opt_d,correct,explanation)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      db.transaction(() => list.forEach((q) => ins.run(uid(), q.subject, q.exam, q.year, q.session || "", q.qno, q.sub, q.stem, q.a, q.b, q.c, q.d, q.ans || "", q.expl || "")))();
      console.log(`PYQ Bank: loaded ${list.length} questions from ${file}`);
    } catch (e) { console.warn("PYQ Bank seed skipped:", e.message); return; }
  }
  db.prepare("INSERT OR REPLACE INTO pq2_meta (k,v) VALUES (?,?)").run(flag, new Date().toISOString());
}
seedOnce("seed_polity_v1", "pyq-polity.json");

const L = (v) => { v = String(v || "").trim().toLowerCase(); return ["a", "b", "c", "d"].includes(v) ? v : ""; };
const shape = (q) => ({
  id: q.id, s: q.subject, x: q.exam, y: q.year, se: q.session, n: q.qno, t: q.subtopic,
  q: q.stem, o: { a: q.opt_a, b: q.opt_b, c: q.opt_c, d: q.opt_d }, c: q.correct, e: q.explanation,
  note: q.notes, f: !!q.flagged, my: q.my_answer, at: q.attempted_at, ac: q.attempt_count, cc: q.correct_count,
  tq: q.tech_txt || "", tr: q.trap_txt || ""
});
const get = (id) => db.prepare("SELECT * FROM pq2_questions WHERE id=?").get(id);

router.get("/pyq/bank", (req, res) => {
  res.json({ questions: db.prepare("SELECT * FROM pq2_questions").all().map(shape) });
});

router.post("/pyq/questions", (req, res) => {
  const b = req.body || {}, o = b.o || {};
  const year = parseInt(b.y, 10), n = parseInt(b.n, 10);
  if (!b.s || !b.x || !year || !n || !String(b.q || "").trim()) return res.status(400).json({ error: "Subject, exam, year, question number and question text are required" });
  const id = uid();
  try {
    db.prepare(`INSERT INTO pq2_questions (id,subject,exam,year,session,qno,subtopic,stem,opt_a,opt_b,opt_c,opt_d,correct,explanation)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, String(b.s).trim(), String(b.x).trim().toUpperCase(), year, String(b.se || "").trim(), n,
      String(b.t || "").trim(), b.q, o.a || "", o.b || "", o.c || "", o.d || "", L(b.c), b.e || "");
  } catch (e) { return res.status(400).json({ error: "That exam / year / session / question number already exists" }); }
  res.json(shape(get(id)));
});

router.patch("/pyq/questions/:id", (req, res) => {
  const q = get(req.params.id);
  if (!q) return res.status(404).json({ error: "Not found" });
  const b = req.body || {}, set = [], val = [];
  const add = (col, v) => { set.push(col + "=?"); val.push(v); };
  if (b.q !== undefined) add("stem", String(b.q));
  if (b.o) ["a", "b", "c", "d"].forEach((k) => { if (b.o[k] !== undefined) add("opt_" + k, String(b.o[k])); });
  if (b.c !== undefined) add("correct", L(b.c));
  if (b.e !== undefined) add("explanation", String(b.e));
  if (b.note !== undefined) add("notes", String(b.note));
  if (b.f !== undefined) add("flagged", b.f ? 1 : 0);
  if (b.t !== undefined) add("subtopic", String(b.t).trim());
  if (b.tq !== undefined) add("tech_txt", String(b.tq));
  if (b.tr !== undefined) add("trap_txt", String(b.tr));
  if (set.length) db.prepare(`UPDATE pq2_questions SET ${set.join(",")} WHERE id=?`).run(...val, q.id);
  res.json(shape(get(q.id)));
});

router.delete("/pyq/questions/:id", (req, res) => {
  db.prepare("DELETE FROM pq2_questions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/pyq/questions/:id/attempt", (req, res) => {
  const q = get(req.params.id), a = L(req.body && req.body.answer);
  if (!q || !a) return res.status(400).json({ error: "Pick an option" });
  const right = q.correct && a === q.correct ? 1 : 0;
  db.prepare("UPDATE pq2_questions SET my_answer=?, attempted_at=?, attempt_count=attempt_count+1, correct_count=correct_count+? WHERE id=?")
    .run(a, new Date().toISOString(), right, q.id);
  res.json(shape(get(q.id)));
});

// ?undo=1 removes the attempt from your stats too (for a mis-click); without it, "try again" keeps the history
router.delete("/pyq/questions/:id/attempt", (req, res) => {
  const q = get(req.params.id);
  if (!q) return res.status(404).json({ error: "Not found" });
  if (req.query.undo && q.my_answer) {
    const wasRight = q.correct && q.my_answer === q.correct ? 1 : 0;
    db.prepare("UPDATE pq2_questions SET attempt_count=?, correct_count=? WHERE id=?")
      .run(Math.max(0, q.attempt_count - 1), Math.max(0, q.correct_count - wasRight), q.id);
  }
  db.prepare("UPDATE pq2_questions SET my_answer='', attempted_at='' WHERE id=?").run(q.id);
  res.json(shape(get(q.id)));
});

// answer key for one paper: { subject, exam, year, session, key: { "2": "a", "3": "c", ... } }
router.put("/pyq/key", (req, res) => {
  const b = req.body || {}, key = b.key || {};
  const upd = db.prepare("UPDATE pq2_questions SET correct=? WHERE subject=? AND exam=? AND year=? AND session=? AND qno=?");
  let n = 0;
  db.transaction(() => Object.keys(key).forEach((k) => {
    const l = L(key[k]); if (!l) return;
    n += upd.run(l, b.subject, String(b.exam), parseInt(b.year, 10), b.session || "", parseInt(k, 10)).changes;
  }))();
  res.json({ updated: n });
});

// rename a subtopic, or merge it into another by renaming to an existing name
router.post("/pyq/subtopic/rename", (req, res) => {
  const { subject, from, to } = req.body || {};
  if (!subject || !from || !String(to || "").trim()) return res.status(400).json({ error: "Missing names" });
  const r = db.prepare("UPDATE pq2_questions SET subtopic=? WHERE subject=? AND subtopic=?").run(String(to).trim(), subject, from);
  res.json({ updated: r.changes });
});

// ---- backup: download everything you wrote, and restore it if ever needed ----
router.get("/pyq/export", (req, res) => {
  const rows = db.prepare("SELECT * FROM pq2_questions ORDER BY subject, exam, year, session, qno").all();
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="pyq-backup-${stamp}.json"`);
  res.send(JSON.stringify({ app: "NotesVerse PYQ Bank", version: 1, exported_at: new Date().toISOString(), count: rows.length, rows }));
});

// restore: adds missing questions and puts back your notes/technique/attempts/answers/subtopics; never deletes anything
router.post("/pyq/restore", (req, res) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: "This is not a PYQ backup file" });
  const find = db.prepare("SELECT id FROM pq2_questions WHERE subject=? AND exam=? AND year=? AND session=? AND qno=?");
  const ins = db.prepare(`INSERT INTO pq2_questions (id,subject,exam,year,session,qno,subtopic,stem,opt_a,opt_b,opt_c,opt_d,correct,explanation,notes,flagged,techniques,my_answer,attempted_at,attempt_count,correct_count,tech_txt,trap_txt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const upd = db.prepare(`UPDATE pq2_questions SET subtopic=?,stem=?,opt_a=?,opt_b=?,opt_c=?,opt_d=?,correct=?,explanation=?,notes=?,flagged=?,my_answer=?,attempted_at=?,attempt_count=?,correct_count=?,tech_txt=?,trap_txt=? WHERE id=?`);
  let added = 0, updated = 0;
  db.transaction(() => rows.forEach((r) => {
    if (!r || !r.subject || !r.exam || !r.year || !r.qno) return;
    const ex = find.get(r.subject, r.exam, r.year, r.session || "", r.qno);
    if (ex) {
      upd.run(r.subtopic || "", r.stem || "", r.opt_a || "", r.opt_b || "", r.opt_c || "", r.opt_d || "", r.correct || "", r.explanation || "", r.notes || "", r.flagged ? 1 : 0, r.my_answer || "", r.attempted_at || "", r.attempt_count || 0, r.correct_count || 0, r.tech_txt || "", r.trap_txt || "", ex.id);
      updated++;
    } else {
      ins.run(uid(), r.subject, r.exam, r.year, r.session || "", r.qno, r.subtopic || "", r.stem || "", r.opt_a || "", r.opt_b || "", r.opt_c || "", r.opt_d || "", r.correct || "", r.explanation || "", r.notes || "", r.flagged ? 1 : 0, r.techniques || "[]", r.my_answer || "", r.attempted_at || "", r.attempt_count || 0, r.correct_count || 0, r.tech_txt || "", r.trap_txt || "");
      added++;
    }
  }))();
  res.json({ added, updated });
});

module.exports = router;
