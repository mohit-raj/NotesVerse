/* =====================================================================
   Keeps the Micro Plan and the notes tree in step.

   Plan subject  <->  notes subject     (plan_subjects.note_subject_id)
   Plan topic    <->  microtheme        (plan_topics.microtheme_id)

   Rules:
   - Adding a plan subject/topic finds the notes subject/microtheme with
     the same name (case-insensitive) or creates it, and links the two.
   - Adding a microtheme under a linked notes subject adds it as a topic
     to every plan subject linked to that notes subject.
   - Renames carry across in both directions.
   - Deletes never cross over: removing something from the plan keeps
     your notes, and deleting a note keeps the plan item (just unlinked).
   - Ticking a linked topic done records a revision for today.
===================================================================== */
const crypto = require("crypto");
const uid = () => crypto.randomUUID();

function sameName(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

/* Find or create the notes subject for a plan subject, and link it. */
function ensureNoteSubject(db, planSubject) {
  if (planSubject.note_subject_id) {
    const ok = db.prepare("SELECT id FROM subjects WHERE id=?").get(planSubject.note_subject_id);
    if (ok) return ok.id;
  }
  const existing = db.prepare("SELECT id,name FROM subjects").all().find((s) => sameName(s.name, planSubject.name));
  let id = existing && existing.id;
  if (!id) {
    id = uid();
    const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM subjects").get().m;
    db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)").run(id, planSubject.name.trim(), max + 1);
  }
  db.prepare("UPDATE plan_subjects SET note_subject_id=? WHERE id=?").run(id, planSubject.id);
  return id;
}

/* Find or create a microtheme by name inside a notes subject. */
function ensureMicrotheme(db, noteSubjectId, name) {
  const existing = db.prepare("SELECT id,name FROM microthemes WHERE subject_id=?").all(noteSubjectId).find((m) => sameName(m.name, name));
  if (existing) return existing.id;
  const id = uid();
  const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM microthemes WHERE subject_id=?").get(noteSubjectId).m;
  db.prepare("INSERT INTO microthemes (id,subject_id,name,tag,sort_order) VALUES (?,?,?,?,?)").run(id, noteSubjectId, name.trim(), "", max + 1);
  // Same default the notes UI gives a new microtheme.
  db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,0)").run(uid(), id, "Basics");
  return id;
}

/* Link one plan topic to its microtheme (creating it if needed). */
function linkTopic(db, topicId) {
  const t = db.prepare("SELECT * FROM plan_topics WHERE id=?").get(topicId);
  if (!t) return;
  if (t.microtheme_id && db.prepare("SELECT 1 FROM microthemes WHERE id=?").get(t.microtheme_id)) return;
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(t.subject_id);
  if (!s) return;
  const noteSubjectId = ensureNoteSubject(db, s);
  const mtId = ensureMicrotheme(db, noteSubjectId, t.name);
  db.prepare("UPDATE plan_topics SET microtheme_id=? WHERE id=?").run(mtId, t.id);
}

/* Link a plan subject and all its topics. */
function linkSubject(db, planSubjectId) {
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (!s) return;
  const noteSubjectId = ensureNoteSubject(db, s);
  db.prepare("SELECT id FROM plan_topics WHERE subject_id=?").all(s.id).forEach((t) => linkTopic(db, t.id));
  // Pull in microthemes the notes subject already has but the plan doesn't.
  const linked = new Set(db.prepare("SELECT microtheme_id FROM plan_topics WHERE subject_id=?").all(s.id).map((r) => r.microtheme_id));
  let max = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM plan_topics WHERE subject_id=?").get(s.id).m;
  const ins = db.prepare("INSERT INTO plan_topics (id,subject_id,name,microtheme_id,sort_order) VALUES (?,?,?,?,?)");
  db.prepare("SELECT id,name FROM microthemes WHERE subject_id=? ORDER BY sort_order, name").all(noteSubjectId)
    .forEach((m) => { if (!linked.has(m.id)) ins.run(uid(), s.id, m.name, m.id, ++max); });
}

/* A microtheme was created from the notes side. */
function onMicrothemeCreated(db, mtId) {
  const mt = db.prepare("SELECT * FROM microthemes WHERE id=?").get(mtId);
  if (!mt) return;
  db.prepare("SELECT id FROM plan_subjects WHERE note_subject_id=?").all(mt.subject_id).forEach((s) => {
    const topics = db.prepare("SELECT * FROM plan_topics WHERE subject_id=?").all(s.id);
    const match = topics.find((t) => t.microtheme_id === mt.id) || topics.find((t) => !t.microtheme_id && sameName(t.name, mt.name));
    if (match) {
      db.prepare("UPDATE plan_topics SET microtheme_id=? WHERE id=?").run(mt.id, match.id);
    } else {
      const max = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM plan_topics WHERE subject_id=?").get(s.id).m;
      db.prepare("INSERT INTO plan_topics (id,subject_id,name,microtheme_id,sort_order) VALUES (?,?,?,?,?)").run(uid(), s.id, mt.name, mt.id, max + 1);
    }
  });
}

/* A notes subject was created from the notes side: link plan subjects with that name. */
function onNoteSubjectCreated(db, subjectId) {
  const subj = db.prepare("SELECT * FROM subjects WHERE id=?").get(subjectId);
  if (!subj) return;
  db.prepare("SELECT * FROM plan_subjects WHERE note_subject_id IS NULL").all()
    .filter((s) => sameName(s.name, subj.name))
    .forEach((s) => linkSubject(db, s.id));
}

function onMicrothemeRenamed(db, mtId, name) {
  db.prepare("UPDATE plan_topics SET name=? WHERE microtheme_id=?").run(name, mtId);
}
function onPlanTopicRenamed(db, topicId, name) {
  const t = db.prepare("SELECT microtheme_id FROM plan_topics WHERE id=?").get(topicId);
  if (t && t.microtheme_id) {
    db.prepare("UPDATE microthemes SET name=? WHERE id=?").run(name, t.microtheme_id);
    db.prepare("UPDATE plan_topics SET name=? WHERE microtheme_id=?").run(name, t.microtheme_id);
  }
}
function onPlanSubjectRenamed(db, planSubjectId, name) {
  const s = db.prepare("SELECT note_subject_id FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (s && s.note_subject_id) db.prepare("UPDATE subjects SET name=? WHERE id=?").run(name, s.note_subject_id);
}

/* Shared with the notes "Mark revised" button so both behave the same:
   one revision per day, plus a 1-minute time entry so the streak counts. */
function markRevised(db, mtId) {
  const today = new Date().toISOString().slice(0, 10);
  if (!db.prepare("SELECT 1 FROM microthemes WHERE id=?").get(mtId)) return;
  if (!db.prepare("SELECT id FROM revisions WHERE microtheme_id=? AND date=?").get(mtId, today)) {
    db.prepare("INSERT INTO revisions (id,microtheme_id,date) VALUES (?,?,?)").run(uid(), mtId, today);
  }
  const logged = db.prepare("SELECT COALESCE(SUM(minutes),0) m FROM time_log WHERE microtheme_id=? AND date=?").get(mtId, today).m;
  if (logged === 0) db.prepare("INSERT INTO time_log (id,microtheme_id,date,minutes) VALUES (?,?,?,1)").run(uid(), mtId, today);
}

/* One-time link of everything already in the plan (runs again only after
   `npm run reset-notes`, which clears the flag). */
function backfill(db) {
  if (db.prepare("SELECT value FROM plan_settings WHERE key='notes_synced'").get()) return;
  db.transaction(() => {
    db.prepare("SELECT id FROM plan_subjects ORDER BY CASE track WHEN 'prelims' THEN 0 WHEN 'mains' THEN 1 WHEN 'ethics' THEN 2 ELSE 3 END, sort_order").all().forEach((s) => linkSubject(db, s.id));
    db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES ('notes_synced','1')").run();
  })();
}

module.exports = {
  linkSubject, linkTopic, onMicrothemeCreated, onNoteSubjectCreated,
  onMicrothemeRenamed, onPlanTopicRenamed, onPlanSubjectRenamed, markRevised, backfill
};
