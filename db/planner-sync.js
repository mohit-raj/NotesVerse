/* =====================================================================
   Micro Plan  <->  notes tree

   Notes:  Subject  ›  Topic (folder)       ›  microtheme (notes page)
           GS3      ›  Internal Security    ›  Left Wing Extremism, Cyber…

   A plan subject points at the notes in one of two ways:

   "topic" mode     plan "GS3 · Internal Security" = notes GS3 › Internal Security
                    plan subtopics  <->  notes pages inside that topic
   "subject" mode   plan "Ethics GS4" = notes subject "GS4 — Ethics"
                    plan subtopics  <->  notes pages directly under it

   Subtopics are the same list on both sides: add, rename or delete one in
   the plan or in the notes and the other side follows. Every subtopic is
   a full notes page, so "Open notes" opens exactly that page.
   The plan is what you're targeting now and the notes hold the whole
   syllabus, so a new notes topic doesn't become a plan subject, and
   removing a plan subject (no longer targeting it) keeps its notes.
===================================================================== */
const crypto = require("crypto");
const uid = () => crypto.randomUUID();

const tokens = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []);
const sameTokens = (a, b) => {
  const x = [...new Set(tokens(a))].sort().join(" "), y = [...new Set(tokens(b))].sort().join(" ");
  return x !== "" && x === y;
};
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const GS_PREFIX = /^\s*gs\s*[1-4]\s*[·:\-–—|]?\s*/i;
// "GS3 · Internal Security" -> "Internal Security"
const topicName = (planName) => String(planName).replace(GS_PREFIX, "").trim() || String(planName).trim();

/* ------------------------------ notes helpers ------------------------------ */
function findOrCreateTopic(db, subjectId, name) {
  const found = db.prepare("SELECT id,name FROM subject_topics WHERE subject_id=?").all(subjectId).find((t) => sameName(t.name, name));
  if (found) return found.id;
  const id = uid();
  const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM subject_topics WHERE subject_id=?").get(subjectId).m;
  db.prepare("INSERT INTO subject_topics (id,subject_id,name,sort_order) VALUES (?,?,?,?)").run(id, subjectId, String(name).trim(), max + 1);
  return id;
}
/* A new notes page, set up the same way as one made from the sidebar. */
function createPage(db, subjectId, topicId, name) {
  const id = uid();
  const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM microthemes WHERE subject_id=?").get(subjectId).m;
  db.prepare("INSERT INTO microthemes (id,subject_id,topic_id,name,tag,sort_order) VALUES (?,?,?,?,?,?)").run(id, subjectId, topicId || null, String(name).trim(), "", max + 1);
  db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,0)").run(uid(), id, "Basics");
  return id;
}
/* The notes pages that are this plan subject's subtopics. */
function pagesFor(db, s) {
  if (s.note_mode === "topic" && s.note_topic_id) return db.prepare("SELECT id,name FROM microthemes WHERE topic_id=? ORDER BY sort_order, name").all(s.note_topic_id);
  if (s.note_mode === "subject" && s.note_subject_id) return db.prepare("SELECT id,name FROM microthemes WHERE subject_id=? AND topic_id IS NULL ORDER BY sort_order, name").all(s.note_subject_id);
  return [];
}
function pageFor(db, s, name) {
  return createPage(db, s.note_subject_id, s.note_mode === "topic" ? s.note_topic_id : null, name);
}

/* ------------------------------ targets ------------------------------ */
function defaultTarget(db, planSubject) {
  const notes = db.prepare("SELECT id,name FROM subjects ORDER BY sort_order").all();
  const exact = notes.find((n) => sameTokens(n.name, planSubject.name));
  if (exact) return exact.id;
  const gs = (String(planSubject.name).match(/\bgs\s*([1-4])\b/i) || [])[1];
  if (gs) {
    const n = notes.find((x) => tokens(x.name).includes("gs" + gs));
    if (n) return n.id;
  }
  return null;
}

/* Put a plan subject under a notes subject (or nothing) and make both
   sides hold the same subtopics. */
function setTarget(db, planSubjectId, noteSubjectId) {
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (!s) return;
  const n = noteSubjectId ? db.prepare("SELECT id,name FROM subjects WHERE id=?").get(noteSubjectId) : null;
  db.prepare("UPDATE plan_topics SET microtheme_id=NULL, section_id=NULL WHERE subject_id=?").run(s.id);
  if (!n) {
    db.prepare("UPDATE plan_subjects SET note_subject_id=NULL, note_mode=NULL, note_topic_id=NULL, note_microtheme_id=NULL WHERE id=?").run(s.id);
    return;
  }
  const mode = sameTokens(n.name, s.name) ? "subject" : "topic";
  const topicId = mode === "topic" ? findOrCreateTopic(db, n.id, topicName(s.name)) : null;
  db.prepare("UPDATE plan_subjects SET note_subject_id=?, note_mode=?, note_topic_id=?, note_microtheme_id=NULL WHERE id=?").run(n.id, mode, topicId, s.id);
  mirror(db, s.id);
}
function assignDefault(db, planSubjectId) {
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (s) setTarget(db, s.id, defaultTarget(db, s));
}

/* Make both sides hold the same subtopics for one plan subject. */
function mirror(db, planSubjectId) {
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (!s || !s.note_mode) return;
  const pages = pagesFor(db, s);
  const topics = db.prepare("SELECT * FROM plan_topics WHERE subject_id=? ORDER BY sort_order").all(s.id);
  const used = new Set();
  topics.forEach((t) => {
    let p = t.microtheme_id && pages.find((x) => x.id === t.microtheme_id);
    if (!p) p = pages.find((x) => !used.has(x.id) && sameName(x.name, t.name));
    const pid = p ? p.id : pageFor(db, s, t.name);
    used.add(pid);
    db.prepare("UPDATE plan_topics SET microtheme_id=?, section_id=NULL WHERE id=?").run(pid, t.id);
  });
  let max = topics.reduce((m, t) => Math.max(m, t.sort_order), -1);
  pages.filter((x) => !used.has(x.id)).forEach((x) => {
    db.prepare("INSERT INTO plan_topics (id,subject_id,name,microtheme_id,sort_order) VALUES (?,?,?,?,?)").run(uid(), s.id, x.name, x.id, ++max);
  });
}

/* ------------------------------ plan -> notes ------------------------------ */
function onPlanTopicAdded(db, topicId) {
  const t = db.prepare("SELECT * FROM plan_topics WHERE id=?").get(topicId);
  const s = t && db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(t.subject_id);
  if (!s || !s.note_mode) return;
  const taken = new Set(db.prepare("SELECT microtheme_id FROM plan_topics WHERE subject_id=? AND id<>? AND microtheme_id IS NOT NULL").all(s.id, t.id).map((r) => r.microtheme_id));
  const existing = pagesFor(db, s).find((p) => !taken.has(p.id) && sameName(p.name, t.name));
  const pid = existing ? existing.id : pageFor(db, s, t.name);
  db.prepare("UPDATE plan_topics SET microtheme_id=?, section_id=NULL WHERE id=?").run(pid, t.id);
}
function onPlanTopicRenamed(db, topicId, name) {
  const t = db.prepare("SELECT microtheme_id FROM plan_topics WHERE id=?").get(topicId);
  if (t && t.microtheme_id) db.prepare("UPDATE microthemes SET name=? WHERE id=?").run(name, t.microtheme_id);
}
/* What deleting a plan subtopic would remove from the notes (for the warning). */
function notesForTopic(db, topicId) {
  const t = db.prepare("SELECT microtheme_id FROM plan_topics WHERE id=?").get(topicId);
  const mt = t && t.microtheme_id && db.prepare("SELECT name FROM microthemes WHERE id=?").get(t.microtheme_id);
  if (!mt) return null;
  const n = (sql) => db.prepare(sql).get(t.microtheme_id).n;
  return {
    name: mt.name,
    bullets: n("SELECT COUNT(*) n FROM items i JOIN sections s ON s.id=i.section_id WHERE s.microtheme_id=?"),
    pyqs: n("SELECT COUNT(*) n FROM pyqs WHERE microtheme_id=?"),
    attachments: n("SELECT COUNT(*) n FROM attachments WHERE microtheme_id=?")
  };
}
function onPlanTopicDeleted(db, topic) {
  if (topic.microtheme_id) db.prepare("DELETE FROM microthemes WHERE id=?").run(topic.microtheme_id);
}
function onPlanSubjectRenamed(db, planSubjectId, name) {
  const s = db.prepare("SELECT * FROM plan_subjects WHERE id=?").get(planSubjectId);
  if (s && s.note_mode === "topic" && s.note_topic_id) db.prepare("UPDATE subject_topics SET name=? WHERE id=?").run(topicName(name), s.note_topic_id);
}

/* ------------------------------ notes -> plan ------------------------------ */
function planSubjectsForPage(db, mt) {
  if (mt.topic_id) return db.prepare("SELECT id FROM plan_subjects WHERE note_mode='topic' AND note_topic_id=?").all(mt.topic_id);
  return db.prepare("SELECT id FROM plan_subjects WHERE note_mode='subject' AND note_subject_id=?").all(mt.subject_id);
}
function onPageCreated(db, mtId) {
  const mt = db.prepare("SELECT * FROM microthemes WHERE id=?").get(mtId);
  if (!mt) return;
  planSubjectsForPage(db, mt).forEach((s) => {
    const max = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM plan_topics WHERE subject_id=?").get(s.id).m;
    db.prepare("INSERT INTO plan_topics (id,subject_id,name,microtheme_id,sort_order) VALUES (?,?,?,?,?)").run(uid(), s.id, mt.name, mt.id, max + 1);
  });
}
function onPageRenamed(db, mtId, name) {
  db.prepare("UPDATE plan_topics SET name=? WHERE microtheme_id=?").run(name, mtId);
}
function beforePageDeleted(db, mtId) {
  db.prepare("DELETE FROM plan_topics WHERE microtheme_id=?").run(mtId);
}
function onNotesTopicRenamed(db, topicId, name) {
  // keep the plan subject's "GS3 · " prefix
  db.prepare("SELECT id,name FROM plan_subjects WHERE note_mode='topic' AND note_topic_id=?").all(topicId).forEach((s) => {
    const prefix = (String(s.name).match(GS_PREFIX) || [""])[0];
    db.prepare("UPDATE plan_subjects SET name=? WHERE id=?").run(prefix + name, s.id);
  });
}
/* Deleting a notes topic keeps its pages (they move up to the subject);
   the plan subject that pointed at it is no longer in the notes. */
function beforeNotesTopicDeleted(db, topicId) {
  db.prepare("SELECT id FROM plan_subjects WHERE note_mode='topic' AND note_topic_id=?").all(topicId).forEach((s) => {
    db.prepare("UPDATE plan_topics SET microtheme_id=NULL WHERE subject_id=?").run(s.id);
    db.prepare("UPDATE plan_subjects SET note_subject_id=NULL, note_mode=NULL, note_topic_id=NULL WHERE id=?").run(s.id);
  });
  db.prepare("UPDATE microthemes SET topic_id=NULL WHERE topic_id=?").run(topicId);
}
function beforeNoteSubjectDeleted(db, subjectId) {
  db.prepare("SELECT id FROM microthemes WHERE subject_id=?").all(subjectId).forEach((m) => beforePageDeleted(db, m.id));
  db.prepare("SELECT id FROM subject_topics WHERE subject_id=?").all(subjectId).forEach((t) => beforeNotesTopicDeleted(db, t.id));
}

/* ------------------------------ revisions ------------------------------ */
/* Shared with the notes "Mark revised" button: one revision per day,
   plus a 1-minute time entry so the streak counts. */
function markRevised(db, mtId) {
  const today = new Date().toISOString().slice(0, 10);
  if (!mtId || !db.prepare("SELECT 1 FROM microthemes WHERE id=?").get(mtId)) return;
  if (!db.prepare("SELECT id FROM revisions WHERE microtheme_id=? AND date=?").get(mtId, today)) {
    db.prepare("INSERT INTO revisions (id,microtheme_id,date) VALUES (?,?,?)").run(uid(), mtId, today);
  }
  const logged = db.prepare("SELECT COALESCE(SUM(minutes),0) m FROM time_log WHERE microtheme_id=? AND date=?").get(mtId, today).m;
  if (logged === 0) db.prepare("INSERT INTO time_log (id,microtheme_id,date,minutes) VALUES (?,?,?,1)").run(uid(), mtId, today);
}
/* Each subtopic is its own notes page, so ticking it done revises that page. */
function onTopicDone(db, topicId) {
  const t = db.prepare("SELECT microtheme_id FROM plan_topics WHERE id=?").get(topicId);
  if (t && t.microtheme_id) markRevised(db, t.microtheme_id);
}

/* ------------------------------ migration ------------------------------ */
/* The previous version made "GS3 · Internal Security" one notes page with
   each subtopic as a section inside it. Turn that into a notes topic with
   one page per subtopic, moving each section (and every bullet in it) into
   its own page. Runs once; nothing written is lost. */
function migrateToTopics(db) {
  if (db.prepare("SELECT value FROM plan_settings WHERE key='notes_topics_v1'").get()) return;
  db.transaction(() => {
    db.prepare("SELECT * FROM plan_subjects WHERE note_mode='microtheme'").all().forEach((s) => {
      const old = s.note_microtheme_id && db.prepare("SELECT * FROM microthemes WHERE id=?").get(s.note_microtheme_id);
      if (!old) {
        db.prepare("UPDATE plan_subjects SET note_mode=NULL, note_microtheme_id=NULL WHERE id=?").run(s.id);
        if (s.note_subject_id) setTarget(db, s.id, s.note_subject_id);
        return;
      }
      const topicId = findOrCreateTopic(db, old.subject_id, old.name);
      db.prepare("SELECT * FROM plan_topics WHERE subject_id=? ORDER BY sort_order").all(s.id).forEach((t) => {
        const pageId = uid();
        const max = db.prepare("SELECT COALESCE(MAX(sort_order),0) m FROM microthemes WHERE subject_id=?").get(old.subject_id).m;
        db.prepare("INSERT INTO microthemes (id,subject_id,topic_id,name,tag,sort_order) VALUES (?,?,?,?,?,?)").run(pageId, old.subject_id, topicId, t.name, "", max + 1);
        if (t.section_id && db.prepare("SELECT 1 FROM sections WHERE id=?").get(t.section_id)) {
          db.prepare("UPDATE sections SET microtheme_id=?, title='Basics', sort_order=0 WHERE id=?").run(pageId, t.section_id);
        } else {
          db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,0,0)").run(uid(), pageId, "Basics");
        }
        db.prepare("UPDATE plan_topics SET microtheme_id=?, section_id=NULL WHERE id=?").run(pageId, t.id);
      });
      db.prepare("UPDATE plan_subjects SET note_mode='topic', note_topic_id=?, note_microtheme_id=NULL WHERE id=?").run(topicId, s.id);
      // Remove the old container page only if nothing else was written in it.
      const left = ["SELECT COUNT(*) n FROM sections WHERE microtheme_id=?", "SELECT COUNT(*) n FROM pyqs WHERE microtheme_id=?",
        "SELECT COUNT(*) n FROM aspects WHERE microtheme_id=?", "SELECT COUNT(*) n FROM people WHERE microtheme_id=?",
        "SELECT COUNT(*) n FROM quotes WHERE microtheme_id=?", "SELECT COUNT(*) n FROM summary_lines WHERE microtheme_id=?",
        "SELECT COUNT(*) n FROM attachments WHERE microtheme_id=?"].reduce((a, q) => a + db.prepare(q).get(old.id).n, 0);
      if (left === 0) db.prepare("DELETE FROM microthemes WHERE id=?").run(old.id);
    });
    db.prepare("INSERT OR REPLACE INTO plan_settings (key,value) VALUES ('notes_topics_v1','1')").run();
  })();
}

module.exports = {
  defaultTarget, setTarget, assignDefault, mirror,
  onPlanTopicAdded, onPlanTopicRenamed, notesForTopic, onPlanTopicDeleted, onPlanSubjectRenamed,
  onPageCreated, onPageRenamed, beforePageDeleted, onNotesTopicRenamed, beforeNotesTopicDeleted, beforeNoteSubjectDeleted,
  markRevised, onTopicDone, migrateToTopics
};
