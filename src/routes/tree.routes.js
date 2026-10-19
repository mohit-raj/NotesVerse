const express = require("express");
const db = require("../../db/index.js");

const router = express.Router();

router.get("/tree", (req, res) => {
  const subjects = db.prepare("SELECT * FROM subjects ORDER BY sort_order, name").all();

  const out = subjects.map((subj) => {
    const microthemes = db
      .prepare("SELECT * FROM microthemes WHERE subject_id = ? ORDER BY sort_order, name")
      .all(subj.id)
      .map((mt) => {
        const quotes = db
          .prepare("SELECT id,text FROM quotes WHERE microtheme_id=? ORDER BY sort_order")
          .all(mt.id);

        const summary = db
          .prepare("SELECT id,text FROM summary_lines WHERE microtheme_id=? ORDER BY sort_order")
          .all(mt.id);

        const people = db
          .prepare("SELECT * FROM people WHERE microtheme_id=? ORDER BY sort_order")
          .all(mt.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            tag: p.tag,
            photo: p.photo_url || "",
            bullets: db
              .prepare("SELECT id,text FROM people_bullets WHERE person_id=? ORDER BY sort_order")
              .all(p.id)
          }));

        const sections = db
          .prepare("SELECT * FROM sections WHERE microtheme_id=? ORDER BY sort_order")
          .all(mt.id)
          .map((s) => ({
            id: s.id,
            title: s.title,
            starred: !!s.starred,
            items: db
              .prepare("SELECT id,text,indent FROM items WHERE section_id=? ORDER BY sort_order")
              .all(s.id)
          }));

        const pyqs = db
          .prepare("SELECT * FROM pyqs WHERE microtheme_id=? ORDER BY year DESC")
          .all(mt.id);

        const aspects = db
          .prepare("SELECT * FROM aspects WHERE microtheme_id=?")
          .all(mt.id)
          .map((a) => ({
            id: a.id,
            label: a.label,
            memorised: !!a.memorised,
            content: a.content || "",
            lastRecall: a.last_recall || ""
          }));

        const revisions = db
          .prepare("SELECT date FROM revisions WHERE microtheme_id=? ORDER BY date")
          .all(mt.id)
          .map((r) => r.date);

        const timeLog = {};
        db.prepare("SELECT date,minutes FROM time_log WHERE microtheme_id=?")
          .all(mt.id)
          .forEach((r) => {
            timeLog[r.date] = (timeLog[r.date] || 0) + r.minutes;
          });

        const attachments = db
          .prepare("SELECT id,filename,original_name,mime_type FROM attachments WHERE microtheme_id=? ORDER BY sort_order")
          .all(mt.id)
          .map((a) => ({ id: a.id, filename: a.filename, originalName: a.original_name, mimeType: a.mime_type }));

        return {
          id: mt.id, name: mt.name, tag: mt.tag, topicId: mt.topic_id || null,
          quotes, summary, people, sections, pyqs, aspects, revisions, timeLog, attachments
        };
      });

    const topics = db.prepare("SELECT id,name FROM subject_topics WHERE subject_id=? ORDER BY sort_order, name").all(subj.id);
    return { id: subj.id, name: subj.name, topics, microthemes };
  });

  res.json(out);
});

module.exports = router;
