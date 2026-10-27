/* "Import notes file": loads a consolidated notes file (.json) into a notes page.
   POST /api/import-notes   { notes: <note|[notes]>, dryRun: true|false }
   Never deletes existing notes. If the page already has content, the new material is ADDED
   (identical lines are skipped), so importing twice is harmless. */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../../db/index.js");
const sync = require("../../db/planner-sync");
const { backupsDir, dbDir } = require("../paths");
const router = express.Router();
const uid = () => crypto.randomUUID();
const tokens = (s) => [...new Set((String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [])) ].sort().join(" ");
const str = (v) => (v == null ? "" : String(v).trim());
const norm = (s) => str(s).toLowerCase().replace(/\s+/g, " ");

function clean(n) {
  if (!n || typeof n !== "object") throw new Error("Not a notes object");
  const o = {
    subject: str(n.subject), topic: str(n.topic), page: str(n.page), tag: str(n.tag),
    summary: (n.summary || []).map(str).filter(Boolean),
    quotes: (n.quotes || []).map(str).filter(Boolean),
    people: (n.people || []).map((p) => ({ name: str(p.name), tag: str(p.tag), bullets: (p.bullets || []).map(str).filter(Boolean) })).filter((p) => p.name),
    sections: []
  };
  // a section: {title, starred, items:[ "text" | {t, i} | {h:"Subheader", items:[...]} ]}
  const flat = (items) => {
    const out = [];
    (items || []).forEach((it) => {
      if (typeof it === "string") { if (str(it)) out.push([str(it), 0]); }
      else if (it && it.h) { out.push(["▸ " + str(it.h), 0]); (it.items || []).forEach((c) => { const t = typeof c === "string" ? c : c.t; if (str(t)) out.push([str(t), Math.min(3, (c.i || 0) + 1)]); }); }
      else if (it && it.t) out.push([str(it.t), Math.min(3, it.i || 0)]);
    });
    return out;
  };
  (n.sections || []).forEach((s) => { if (str(s.title)) o.sections.push({ title: str(s.title), starred: s.starred ? 1 : 0, items: flat(s.items) }); });
  if (n.miscellaneous && n.miscellaneous.length) o.sections.push({ title: "Miscellaneous", starred: 0, items: flat(n.miscellaneous) });
  if (!o.subject || !o.topic || !o.page) throw new Error('Each notes entry needs "subject", "topic" and "page"');
  return o;
}

function plan(o) {
  const subjects = db.prepare("SELECT id,name FROM subjects ORDER BY sort_order").all();
  const sn = norm(o.subject);
  const subject = subjects.find((s) => norm(s.name) === sn) || subjects.find((s) => norm(s.name).startsWith(sn) || sn.startsWith(norm(s.name).split(/[\s—–-]/)[0]) && norm(s.name).split(/[\s—–-]/)[0].length >= 2 && norm(s.name).split(/[\s—–-]/)[0] === sn.split(/[\s—–-]/)[0]);
  let topic = null, page = null;
  if (subject) {
    topic = db.prepare("SELECT id,name FROM subject_topics WHERE subject_id=?").all(subject.id).find((t) => norm(t.name) === norm(o.topic)) || null;
    page = db.prepare("SELECT id,name FROM microthemes WHERE subject_id=?").all(subject.id).find((p) => tokens(p.name) === tokens(o.page)) || null;
  }
  let existing = null;
  if (page) {
    const c = (sql) => db.prepare(sql).get(page.id).c;
    existing = c("SELECT COUNT(*) c FROM summary_lines WHERE microtheme_id=?") + c("SELECT COUNT(*) c FROM quotes WHERE microtheme_id=?") + c("SELECT COUNT(*) c FROM people WHERE microtheme_id=?")
      + c("SELECT COUNT(*) c FROM items WHERE section_id IN (SELECT id FROM sections WHERE microtheme_id=?)");
  }
  return { subject, topic, page, existing };
}

function describe(o, p) {
  return {
    path: `${p.subject ? p.subject.name : o.subject + " (new)"} › ${p.topic ? p.topic.name : o.topic + (p.subject ? " (new)" : "")} › ${o.page}`,
    action: !p.page ? "create new page" : p.existing ? "page already has notes: new material will be ADDED, duplicates skipped" : "fill the empty page",
    counts: { summary: o.summary.length, quotes: o.quotes.length, people: o.people.length, sections: o.sections.length, points: o.sections.reduce((a, s) => a + s.items.length, 0) }
  };
}

function apply(o) {
  const p = plan(o);
  let subjectId, topicId, pageId, created = false;
  if (p.subject) subjectId = p.subject.id;
  else {
    subjectId = uid();
    db.prepare("INSERT INTO subjects (id,name,sort_order) VALUES (?,?,?)").run(subjectId, o.subject, db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 m FROM subjects").get().m);
  }
  if (p.topic) topicId = p.topic.id;
  else {
    topicId = uid();
    db.prepare("INSERT INTO subject_topics (id,subject_id,name,sort_order) VALUES (?,?,?,?)").run(topicId, subjectId, o.topic, db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 m FROM subject_topics WHERE subject_id=?").get(subjectId).m);
  }
  if (p.page) {
    pageId = p.page.id;
    if (!p.existing) db.prepare("DELETE FROM sections WHERE microtheme_id=?").run(pageId); // only the empty default section
    db.prepare("UPDATE microthemes SET topic_id=?, tag=CASE WHEN COALESCE(tag,'')='' THEN ? ELSE tag END WHERE id=?").run(topicId, o.tag, pageId);
  } else {
    pageId = uid(); created = true;
    db.prepare("INSERT INTO microthemes (id,subject_id,topic_id,name,tag,sort_order) VALUES (?,?,?,?,?,?)").run(pageId, subjectId, topicId, o.page, o.tag, db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 m FROM microthemes WHERE subject_id=?").get(subjectId).m);
    sync.onPageCreated(db, pageId);
    db.prepare("DELETE FROM sections WHERE microtheme_id=? AND id NOT IN (SELECT section_id FROM items)").run(pageId);
  }
  const nxt = (t, col, id) => db.prepare(`SELECT COALESCE(MAX(sort_order),-1)+1 m FROM ${t} WHERE ${col}=?`).get(id).m;
  const have = (sql, id) => new Set(db.prepare(sql).all(id).map((r) => norm(r.text)));
  let added = 0;
  const sl = have("SELECT text FROM summary_lines WHERE microtheme_id=?", pageId);
  o.summary.forEach((t) => { if (sl.has(norm(t))) return; db.prepare("INSERT INTO summary_lines (id,microtheme_id,text,sort_order) VALUES (?,?,?,?)").run(uid(), pageId, t, nxt("summary_lines", "microtheme_id", pageId)); added++; });
  const ql = have("SELECT text FROM quotes WHERE microtheme_id=?", pageId);
  o.quotes.forEach((t) => { if (ql.has(norm(t))) return; db.prepare("INSERT INTO quotes (id,microtheme_id,text,sort_order) VALUES (?,?,?,?)").run(uid(), pageId, t, nxt("quotes", "microtheme_id", pageId)); added++; });
  o.people.forEach((pp) => {
    let row = db.prepare("SELECT id FROM people WHERE microtheme_id=?").all(pageId).find((r) => norm(db.prepare("SELECT name FROM people WHERE id=?").get(r.id).name) === norm(pp.name));
    let pid = row && row.id;
    if (!pid) { pid = uid(); db.prepare("INSERT INTO people (id,microtheme_id,name,tag,photo_url,sort_order) VALUES (?,?,?,?,?,?)").run(pid, pageId, pp.name, pp.tag, "", nxt("people", "microtheme_id", pageId)); added++; }
    const hb = have("SELECT text FROM people_bullets WHERE person_id=?", pid);
    pp.bullets.forEach((b) => { if (hb.has(norm(b))) return; db.prepare("INSERT INTO people_bullets (id,person_id,text,sort_order) VALUES (?,?,?,?)").run(uid(), pid, b, nxt("people_bullets", "person_id", pid)); added++; });
  });
  o.sections.forEach((s) => {
    let sec = db.prepare("SELECT id FROM sections WHERE microtheme_id=? AND lower(title)=?").get(pageId, s.title.toLowerCase());
    let sid = sec && sec.id;
    if (!sid) { sid = uid(); db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,?,?)").run(sid, pageId, s.title, s.starred, nxt("sections", "microtheme_id", pageId)); }
    const hi = have("SELECT text FROM items WHERE section_id=?", sid);
    s.items.forEach(([t, ind]) => { if (hi.has(norm(t))) return; db.prepare("INSERT INTO items (id,section_id,text,indent,sort_order) VALUES (?,?,?,?,?)").run(uid(), sid, t, ind, nxt("items", "section_id", sid)); added++; });
  });
  return { pageId, created, added };
}

router.post("/import-notes", (req, res) => {
  try {
    let list = req.body && req.body.notes;
    if (list && !Array.isArray(list)) list = list.notes && Array.isArray(list.notes) ? list.notes : [list];
    if (!Array.isArray(list) || !list.length) return res.status(400).send("No notes found in that file.");
    const cleaned = list.map(clean);
    if (req.body.dryRun) return res.json({ items: cleaned.map((o) => describe(o, plan(o))) });
    db.pragma("wal_checkpoint(FULL)");
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    fs.copyFileSync(path.join(dbDir, "vault.sqlite3"), path.join(backupsDir, `before-import-${stamp}.sqlite3`));
    const out = [];
    db.transaction(() => cleaned.forEach((o) => out.push({ page: o.page, ...apply(o) })))();
    res.json({ done: out });
  } catch (e) { res.status(400).send(e.message); }
});

/* Paste notes into a page: blocks = [{title, starred, items:[[text, indent], ...]}].
   A block with no title goes into `sectionId` (appended at the end, or replacing `replaceItemId`
   with the new lines in the same place). Titled blocks become new sections at the end of the page. */
router.post("/pages/:id/paste", (req, res) => {
  try {
    const pageId = req.params.id, { sectionId, replaceItemId } = req.body;
    const blocks = (req.body.blocks || []).map((b) => ({ title: str(b.title), starred: b.starred ? 1 : 0,
      items: (b.items || []).map((i) => [str(i[0]), Math.max(0, Math.min(2, i[1] | 0))]).filter((i) => i[0]) }));
    if (!db.prepare("SELECT id FROM microthemes WHERE id=?").get(pageId)) return res.status(404).send("page not found");
    db.transaction(() => {
      const putItems = (sid, items, replaceId) => {
        const cur = db.prepare("SELECT id FROM items WHERE section_id=? ORDER BY sort_order").all(sid).map((r) => r.id);
        const ids = items.map(() => uid());
        items.forEach(([t, ind], k) => db.prepare("INSERT INTO items (id,section_id,text,indent,sort_order) VALUES (?,?,?,?,?)").run(ids[k], sid, t, ind, 9999 + k));
        let order = cur;
        const at = replaceId ? cur.indexOf(replaceId) : -1;
        if (at >= 0) { db.prepare("DELETE FROM items WHERE id=?").run(replaceId); order = cur.slice(0, at).concat(ids, cur.slice(at + 1)); }
        else order = cur.concat(ids);
        order.forEach((id, k) => db.prepare("UPDATE items SET sort_order=? WHERE id=?").run(k, id));
      };
      blocks.forEach((b, n) => {
        if (!b.title && n === 0 && sectionId) { putItems(sectionId, b.items, replaceItemId); return; }
        const sid = uid();
        const t = b.title || "Notes";
        db.prepare("INSERT INTO sections (id,microtheme_id,title,starred,sort_order) VALUES (?,?,?,?,?)").run(sid, pageId, t, b.starred, db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 m FROM sections WHERE microtheme_id=?").get(pageId).m);
        putItems(sid, b.items, null);
      });
    })();
    res.json({ ok: true });
  } catch (e) { res.status(400).send(e.message); }
});
module.exports = router;
