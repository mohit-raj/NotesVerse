/* =====================================================================
   MICRO PLAN — daily targets for Prelims, GS mains, Ethics, Optional, BPSC.
   Saved in the same SQLite vault (plan_* tables, /api/planner routes).

   Re-uses what NotesVerse already has instead of duplicating it:
   - hours studied for a day come from the existing study timer
     (mergedTimeLog), not a second hours field
   - notes are Subject › Topic › page; a plan subject is a notes topic
     (e.g. GS3 › Internal Security) and each of its subtopics is a notes
     page, the same list on both sides — see db/planner-sync.js
   - theme, auth, backups and the api()/escapeHtml() helpers are shared
   The sidebar sticky note stays the undated scratchpad; the day note
   here is tied to a date.
   Loaded before app.js; everything here is called after app.js init.
===================================================================== */

const PL_TRACKS = [
  { k: "prelims", n: "Prelims" },
  { k: "mains", n: "GS mains" },
  { k: "ethics", n: "Ethics GS4" },
  { k: "optional", n: "Optional" },
  { k: "bpsc", n: "BPSC" }
];
const plPlain = (k) => k === "prelims" || k === "bpsc"; // plan-only tracks (no notes pages)
let planner = null;          // { settings, tracks, days }
let plDay = plLocalDate(new Date());
const plOpenTopics = new Set();
let plSaveTimer = null;

function plLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function plToday() { return plLocalDate(new Date()); }
function plDaysTo(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(plToday() + "T00:00:00")) / 864e5);
}
function plFmt(iso, long) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", long
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { weekday: "short", day: "numeric", month: "short" });
}
function plCurrent(track) { return (planner.tracks[track] || []).find((s) => s.status === "current"); }
function plFindSubject(id) {
  for (const t of PL_TRACKS) { const s = (planner.tracks[t.k] || []).find((x) => x.id === id); if (s) return s; }
  return null;
}
function plEntry(date) {
  if (!planner.days[date]) planner.days[date] = { note: "", tracks: {} };
  const d = planner.days[date];
  PL_TRACKS.forEach((t) => {
    if (!d.tracks[t.k]) {
      const c = plCurrent(t.k);
      const e = { subject: c ? c.name : "", topic: "", target: "", done: false, doneTopics: "" };
      const carry = plCarry(t.k, date);
      if (carry) { if (t.k !== "bpsc") e.subject = carry.subject; e.topic = carry.left.join(PL_SEP); e.carried = carry.left.join(PL_SEP); }
      d.tracks[t.k] = e;
    }
    if (d.tracks[t.k].doneTopics == null) d.tracks[t.k].doneTopics = "";
  });
  return d;
}
/* Topics picked on the latest earlier day that were not ticked: they come forward to this day. */
function plCarry(track, date) {
  const ds = Object.keys(planner.days).filter((x) => x < date).sort().reverse();
  for (const x of ds) {
    const te = (planner.days[x].tracks || {})[track];
    const sel = te ? plTopicList(te.topic) : [];
    if (!sel.length) continue;
    const dn = plTopicList(te.doneTopics);
    const left = sel.filter((n) => !dn.includes(n));
    return left.length ? { subject: te.subject || "", left } : null;
  }
  return null;
}
/* Progress for one track card: ticked topics out of picked topics (or the single target tick). */
function plTrackStats(te) {
  const sel = plTopicList(te.topic);
  if (sel.length) { const dn = plTopicList(te.doneTopics); return { total: sel.length, done: sel.filter((n) => dn.includes(n)).length }; }
  if (te.target && String(te.target).trim()) return { total: 1, done: te.done ? 1 : 0 };
  return { total: 0, done: 0 };
}
function plDayStats(e) {
  let total = 0, done = 0;
  PL_TRACKS.forEach((t) => { const s = plTrackStats(e.tracks[t.k]); total += s.total; done += s.done; });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function plSyncDone(te) { const s = plTrackStats(te); if (plTopicList(te.topic).length) te.done = s.total > 0 && s.done === s.total; }
function plBpscAdd(inp) {
  const v = inp.value.trim(); if (!v) return;
  const te = plEntry(plDay).tracks.bpsc;
  const cur = plTopicList(te.topic);
  if (!cur.includes(v)) cur.push(v);
  te.topic = cur.join(PL_SEP);
  plSyncDone(te); plQueueDaySave(); plRenderDay();
}
function plBpscRemove(name) {
  const te = plEntry(plDay).tracks.bpsc;
  te.topic = plTopicList(te.topic).filter((x) => x !== name).join(PL_SEP);
  te.doneTopics = plTopicList(te.doneTopics).filter((x) => x !== name).join(PL_SEP);
  plSyncDone(te); plQueueDaySave(); plRenderDay();
}
function plToggleTopicDone(track, name, on) {
  const te = plEntry(plDay).tracks[track];
  const cur = plTopicList(te.doneTopics).filter((x) => x !== name);
  if (on) cur.push(name);
  te.doneTopics = cur.join(PL_SEP);
  plSyncDone(te);
  plQueueDaySave(); plRenderDay();
}
/* A day's subtopics for one track are stored as one text, names joined by "||" (older single names still work). */
const PL_SEP = "||";
function plTopicList(v) { return String(v || "").split(PL_SEP).map((x) => x.trim()).filter(Boolean); }
let plPickOpen = {};
function plToggleTopicPick(track, name, on) {
  const te = plEntry(plDay).tracks[track];
  const cur = plTopicList(te.topic).filter((x) => x !== name);
  if (on) cur.push(name);
  te.topic = cur.join(PL_SEP);
  te.doneTopics = plTopicList(te.doneTopics).filter((x) => cur.includes(x)).join(PL_SEP);
  plSyncDone(te);
  plPickOpen[track] = true;
  plQueueDaySave(); plRenderDay();
}
function plIsLogged(d) { return d && (d.note || Object.values(d.tracks || {}).some((t) => t.target || t.done)); }
function plMinutes(m) { if (!m) return ""; const h = Math.floor(m / 60), r = m % 60; return h ? `${h}h ${r}m` : `${r}m`; }

async function loadPlanner() { planner = await api("GET", "/api/planner"); }
async function plReload() {
  // Day entries only change on this page, so keep the local copy (it may
  // hold an edit whose save is still pending) and refresh the rest.
  // The notes tree is refreshed too, since plan changes add microthemes.
  const days = planner ? planner.days : null;
  await Promise.all([loadPlanner(), refreshTree()]);
  if (days) planner.days = days;
  render();
}
function openPlanner() {
  ui.currentView = "planner"; saveUiPrefs();
  loadPlanner().then(render).catch(() => {});
  render();
}

/* ------------------------------ save one day ------------------------------ */
function plQueueDaySave() {
  const el = document.getElementById("pl-save");
  if (el) el.textContent = "Saving…";
  clearTimeout(plSaveTimer);
  const date = plDay;
  plSaveTimer = setTimeout(() => plSaveDay(date), 700);
}
function plSaveDay(date) {
  const d = planner.days[date];
  if (!d) return;
  api("PUT", `/api/planner/days/${date}`, { note: d.note, tracks: d.tracks })
    .then(() => { const el = document.getElementById("pl-save"); if (el) el.textContent = "Saved"; plRenderStats(); plRenderLog(); })
    .catch(() => { const el = document.getElementById("pl-save"); if (el) el.textContent = "Not saved"; });
}
function plFlushDaySave() { if (plSaveTimer) { clearTimeout(plSaveTimer); plSaveTimer = null; plSaveDay(plDay); } }

/* ------------------------------ render ------------------------------ */
function renderPlanner() {
  const c = document.getElementById("content");
  if (!planner) { c.innerHTML = `<div class="loading">Loading your plan…</div>`; return; }
  c.innerHTML = `
    <div class="pl-wrap">
      <div class="pl-head">
        <div>
          <h1 class="pl-title">UPSC/BPSC Micro Plan 2027</h1>
          <div class="pl-sub">${plFmt(plToday(), true)}</div>
        </div>
      </div>
      <div class="cards-row" id="pl-stats"></div>

      <div class="row-between pl-sec-head">
        <h2 class="plain-head pl-h2" id="pl-day-title"></h2>
        <div class="pl-daybar">
          <input type="date" id="pl-day-pick" value="${plDay}" onchange="plPickDay(this.value)" aria-label="Pick a day">
          <span class="btn small" onclick="plPickDay(plToday())">Today</span>
          <span class="pl-save" id="pl-save"></span>
        </div>
      </div>
      <div class="pl-studied" id="pl-studied"></div>
      <div class="pl-daytotal" id="pl-day-total"></div>
      <div class="pl-grid" id="pl-day-cards"></div>
      <label class="pl-label" for="pl-day-note">Note for the day</label>
      <textarea id="pl-day-note" class="pl-input pl-note" placeholder="What went well, what slipped, what to carry to tomorrow"
        oninput="plSetNote(this.value)" onblur="plFlushDaySave()"></textarea>

      <div class="row-between pl-sec-head"><h2 class="plain-head pl-h2">Subjects</h2>
        <span class="pl-hint">Tap the status to cycle: To do → Current → Done</span></div>
      <div class="pl-grid" id="pl-subjects"></div>

      <div class="row-between pl-sec-head"><h2 class="plain-head pl-h2">Log</h2>
        <span class="pl-hint">Tap a date to open and edit that day</span></div>
      <div id="pl-log"></div>

      <div class="row-between pl-sec-head"><h2 class="plain-head pl-h2">Dates</h2></div>
      <div class="pl-dates">
        <label class="pl-label">Prelims date<input type="date" class="pl-input" value="${planner.settings.examDate || ""}" onchange="plSetDate('examDate', this.value)"></label>
        <label class="pl-label">Mains target date<input type="date" class="pl-input" value="${planner.settings.mainsDate || ""}" onchange="plSetDate('mainsDate', this.value)"></label>
      </div>
    </div>`;
  plRenderStats();
  plRenderDay();
  plRenderSubjects();
  plRenderLog();
}

function plRenderStats() {
  const el = document.getElementById("pl-stats");
  if (!el || !planner) return;
  const p = plDaysTo(planner.settings.examDate), m = plDaysTo(planner.settings.mainsDate);
  const all = PL_TRACKS.flatMap((t) => planner.tracks[t.k] || []);
  const done = all.filter((s) => s.status === "done").length;
  const logged = Object.values(planner.days).filter(plIsLogged).length;
  el.innerHTML = `
    <div class="dcard"><div class="num">${p == null ? "–" : Math.max(0, p)}</div><div class="lab">DAYS TO PRELIMS</div></div>
    <div class="dcard"><div class="num">${m == null ? "–" : Math.max(0, m)}</div><div class="lab">DAYS TO MAINS TARGET</div></div>
    <div class="dcard"><div class="num">${logged}</div><div class="lab">DAYS LOGGED</div></div>
    <div class="dcard"><div class="num">${done} / ${all.length}</div><div class="lab">SUBJECTS DONE</div>
      <div class="bar"><div style="width:${all.length ? (done / all.length) * 100 : 0}%"></div></div></div>`;
}

function plRenderDay() {
  const e = plEntry(plDay);
  document.getElementById("pl-day-title").textContent = plDay === plToday() ? "Today's targets" : "Targets · " + plFmt(plDay);
  document.getElementById("pl-day-pick").value = plDay;
  const ds = plDayStats(e);
  document.getElementById("pl-day-total").innerHTML = ds.total
    ? `<b>Day target: ${ds.done}/${ds.total} · ${ds.pct}%</b><span class="stat-bar pl-bar"><span class="stat-bar-fill" style="width:${ds.pct}%"></span></span>`
    : `<span class="pl-s">Pick subtopics or write a target to track the day</span>`;
  document.getElementById("pl-day-note").value = e.note || "";
  const mins = (typeof mergedTimeLog === "function" ? mergedTimeLog() : {})[plDay] || 0;
  document.getElementById("pl-studied").innerHTML = mins
    ? `⏱ <b>${plMinutes(mins)}</b> studied on this day (from the study timer)`
    : `⏱ No timer time logged on this day`;

  document.getElementById("pl-day-cards").innerHTML = PL_TRACKS.map((t) => {
    const te = e.tracks[t.k];
    if (t.k === "bpsc") {
      // BPSC: no subject/subtopic lists. Pick Prelims, Mains or both, then write the target.
      const bItems = plTopicList(te.topic), bDone = plTopicList(te.doneTopics);
      const on = String(te.subject || "").split(",").map((x) => x.trim()).filter(Boolean);
      return `<div class="pl-card pl-bpsc">
        <div class="pl-track">${t.n}</div>
        <div class="pl-modes">${["Prelims", "Mains"].map((m) => `<span class="pl-mode ${on.includes(m) ? "on" : ""}" onclick="plToggleBpscMode('${m}')">${m}</span>`).join("")}</div>
        <div class="pl-label">Elements <span class="pl-s">(type one, press Enter or Add)</span>
          <form class="pl-add" onsubmit="event.preventDefault(); plBpscAdd(this.elements[0])">
            <input class="pl-input" type="text" placeholder="e.g. Bihar history, Current affairs">
            <button class="btn small" type="submit">Add</button>
          </form></div>
        ${bItems.length ? `<div class="pl-tcheck">${bItems.map((n) => `<label class="pl-done ${bDone.includes(n) ? "tdone" : ""}"><input type="checkbox" ${bDone.includes(n) ? "checked" : ""} data-n="${escapeHtml(n)}" onchange="plToggleTopicDone('bpsc', this.getAttribute('data-n'), this.checked)"> ${escapeHtml(n)}${plTopicList(te.carried).includes(n) ? ` <span class="pl-carry">↪ carried</span>` : ""} <span class="pl-ic" title="Remove" data-n="${escapeHtml(n)}" onclick="event.preventDefault(); plBpscRemove(this.getAttribute('data-n'))">✕</span></label>`).join("")}</div>` : ""}
        <label class="pl-label">Target
          <textarea class="pl-input" rows="3" placeholder="e.g. Bihar history + 20 MCQs"
            oninput="plSetField('bpsc','target',this.value,true)" onblur="plFlushDaySave()">${escapeHtml(te.target)}</textarea></label>
        ${bItems.length ? "" : `<label class="pl-done"><input type="checkbox" ${te.done ? "checked" : ""} onchange="plSetField('bpsc','done',this.checked)"> Target done</label>`}
        ${(() => { const st = plTrackStats(te); return st.total ? `<div class="pl-prog"><span>${st.done}/${st.total} · ${Math.round(st.done / st.total * 100)}%</span><span class="stat-bar pl-bar"><span class="stat-bar-fill" style="width:${st.done / st.total * 100}%"></span></span></div>` : ""; })()}
      </div>`;
    }
    const subs = planner.tracks[t.k] || [];
    const names = subs.map((s) => s.name);
    const opts = (te.subject && !names.includes(te.subject) ? [te.subject] : []).concat(names);
    const sObj = subs.find((s) => s.name === te.subject);
    const tops = (sObj && sObj.topics) || [];
    const tnames = tops.map((x) => x.name);
    const selTopics = plTopicList(te.topic);
    const topts = selTopics.filter((x) => !tnames.includes(x)).concat(tnames);
    const linkedAll = selTopics.map((n) => tops.find((x) => x.name === n && x.microthemeId && findMicrotheme(x.microthemeId))).filter(Boolean);
    return `<div class="pl-card pl-${t.k}">
      <div class="pl-track">${t.n}</div>
      <label class="pl-label">Subject
        <select class="pl-input" onchange="plSetField('${t.k}','subject',this.value)">
          <option value="">— none today —</option>
          ${opts.map((n) => `<option value="${escapeHtml(n)}" ${n === te.subject ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}
        </select></label>
      <div class="pl-label">Subtopics <span class="pl-s">(tick one or more)</span>
        <details class="pl-pick" ${plPickOpen[t.k] ? "open" : ""} ontoggle="plPickOpen['${t.k}']=this.open">
          <summary class="pl-input">${selTopics.length ? selTopics.map(escapeHtml).join(", ") : (topts.length ? "— pick subtopics —" : "No subtopics yet")}</summary>
          <div class="pl-pick-list">
            ${topts.map((n) => { const o = tops.find((x) => x.name === n); return `<label class="pl-pick-row"><input type="checkbox" ${selTopics.includes(n) ? "checked" : ""} onchange="plToggleTopicPick('${t.k}', this.getAttribute('data-n'), this.checked)" data-n="${escapeHtml(n)}"> ${o && o.done ? "✓ " : ""}${escapeHtml(n)}</label>`; }).join("")}
          </div>
        </details></div>
      ${linkedAll.map((l) => `<span class="btn small" onclick="openMicrotheme('${l.microthemeId}')">📖 ${escapeHtml(l.name)}</span>`).join(" ")}
      <label class="pl-label">Target
        <textarea class="pl-input" rows="3" placeholder="e.g. Class 3 + notes + 1 answer"
          oninput="plSetField('${t.k}','target',this.value,true)" onblur="plFlushDaySave()">${escapeHtml(te.target)}</textarea></label>
      ${selTopics.length ? `<div class="pl-tcheck">${selTopics.map((n) => `<label class="pl-done ${plTopicList(te.doneTopics).includes(n) ? "tdone" : ""}"><input type="checkbox" ${plTopicList(te.doneTopics).includes(n) ? "checked" : ""} data-n="${escapeHtml(n)}" onchange="plToggleTopicDone('${t.k}', this.getAttribute('data-n'), this.checked)"> ${escapeHtml(n)}${plTopicList(te.carried).includes(n) ? ` <span class="pl-carry">↪ carried</span>` : ""}</label>`).join("")}</div>`
        : `<label class="pl-done"><input type="checkbox" ${te.done ? "checked" : ""} onchange="plSetField('${t.k}','done',this.checked)"> Target done</label>`}
      ${(() => { const st = plTrackStats(te); return st.total ? `<div class="pl-prog"><span>${st.done}/${st.total} · ${Math.round(st.done / st.total * 100)}%</span><span class="stat-bar pl-bar"><span class="stat-bar-fill" style="width:${st.done / st.total * 100}%"></span></span></div>` : ""; })()}
    </div>`;
  }).join("");
}

function plRenderSubjects() {
  const el = document.getElementById("pl-subjects");
  if (!el) return;
  el.innerHTML = PL_TRACKS.filter((t) => t.k !== "bpsc").map((t) => {
    const subs = planner.tracks[t.k] || [];
    const done = subs.filter((s) => s.status === "done").length;
    return `<div class="pl-card pl-${t.k}">
      <div class="pl-track">${t.n}</div>
      <div class="pl-prog"><span>${done} of ${subs.length} done</span><span class="stat-bar pl-bar"><span class="stat-bar-fill" style="width:${subs.length ? (done / subs.length) * 100 : 0}%"></span></span></div>
      ${subs.length ? `<ol class="pl-subs">${subs.map((s, i) => {
        const tp = s.topics || [];
        const td = tp.filter((x) => x.done).length;
        const open = plOpenTopics.has(s.id);
        return `<li class="${s.status}">
          <div class="pl-row">
            <span class="pl-nm">${escapeHtml(s.name)}</span>
            <span class="pl-chip ${s.status}" onclick="plCycle('${s.id}')">${s.status === "done" ? "Done" : s.status === "current" ? "Current" : "To do"}</span>
            ${i > 0 ? `<span class="pl-ic" title="Move up" onclick="plMoveSubject('${s.id}')">↑</span>` : `<span class="pl-ic off">↑</span>`}
            <span class="pl-ic" title="Remove" onclick="plDeleteSubject('${s.id}')">✕</span>
          </div>
          <div class="pl-row pl-meta">
            <span class="pl-tgl" onclick="plToggleTopics('${s.id}')">${open ? "▾" : "▸"} Subtopics <span class="pl-tc">${tp.length ? `${td}/${tp.length}` : "add"}</span></span>
            ${plNotePathHtml(s)}
          </div>
          ${open ? `<div class="pl-topics">
            ${plPlain(t.k) ? "" : `<label class="pl-label">Goes in notes under
              <select class="pl-input" onchange="plSetNoteTarget('${s.id}', this.value)">
                <option value="">— not in notes —</option>
                ${(planner.noteSubjects || []).map((n) => `<option value="${n.id}" ${n.id === s.noteSubjectId ? "selected" : ""}>${escapeHtml(n.name)}</option>`).join("")}
              </select></label>`}
            ${!plPlain(t.k) && s.noteSubjectId && tp.some((x) => !x.microthemeId) ? `<span class="btn small" onclick="plPush('${s.id}')">↻ Match ${tp.filter((x) => !x.microthemeId).length} with notes</span>` : ""}
            ${tp.length ? `<ul>${tp.map((x, j) => `<li class="${x.done ? "tdone" : ""}">
              <label><input type="checkbox" ${x.done ? "checked" : ""} onchange="plToggleTopic('${s.id}','${x.id}',this.checked)"> <span>${escapeHtml(x.name)}</span></label>
              ${x.microthemeId && findMicrotheme(x.microthemeId) ? `<span class="pl-ic" title="Open notes" onclick="openMicrotheme('${x.microthemeId}')">📖</span>` : ""}
              ${j > 0 ? `<span class="pl-ic" title="Move up" onclick="plMoveTopic('${x.id}')">↑</span>` : ""}
              <span class="pl-ic" title="Remove" onclick="plDeleteTopic('${x.id}')">✕</span>
            </li>`).join("")}</ul>` : `<div class="weak-empty">No subtopics yet.${s.noteSubjectId ? " Add them here or in your notes; both stay the same." : ""}</div>`}
            <form class="pl-add" onsubmit="event.preventDefault(); plAddTopics('${s.id}', this.elements[0])">
              <input class="pl-input" type="text" placeholder="Add subtopic (paste many lines at once)" onpaste="plPasteTopics(event,'${s.id}',this)">
              <button class="btn small" type="submit">Add</button>
            </form>
          </div>` : ""}
        </li>`;
      }).join("")}</ol>` : `<div class="weak-empty">No subjects yet. Add the first one below.</div>`}
      ${plPlain(t.k) ? `<form class="pl-add" onsubmit="event.preventDefault(); plAddSubject('${t.k}', this.elements[0], null)">
        <input class="pl-input" type="text" placeholder="Add subject, e.g. Economy">
        <button class="btn small" type="submit">Add</button>
      </form>` : `<form class="pl-add pl-add-subj" onsubmit="event.preventDefault(); plAddSubject('${t.k}', this.elements[0], this.elements[1])">
        <input class="pl-input" type="text" placeholder="Add topic, e.g. GS3 · Economy">
        <select class="pl-input" title="Which notes subject it goes under">
          <option value="auto">Notes: from name</option>
          ${(planner.noteSubjects || []).map((n) => `<option value="${n.id}">Notes: ${escapeHtml(n.name)}</option>`).join("")}
          <option value="">Not in notes</option>
        </select>
        <button class="btn small" type="submit">Add</button>
      </form>`}
    </div>`;
  }).join("");
}

/* Where a plan subject lives in the notes, e.g. "GS3 › Agriculture". */
function plStripGs(name) { return String(name).replace(/^\s*gs\s*[1-4]\s*[·:\-–—|]?\s*/i, "").trim() || String(name).trim(); }
function plNotePathHtml(s) {
  if (!s.noteSubjectId) return "";
  const ns = (planner.noteSubjects || []).find((n) => n.id === s.noteSubjectId);
  if (!ns) return "";
  if (s.noteMode === "subject") {
    return `<span class="pl-path pl-link" title="Each subtopic is a notes page directly under ${escapeHtml(ns.name)}" onclick="plRevealInNotes('${ns.id}', null)">📒 ${escapeHtml(ns.name)}</span>`;
  }
  const f = s.noteTopicId && typeof findTopic === "function" ? findTopic(s.noteTopicId) : null;
  return `<span class="pl-path pl-link" title="Show in the notes sidebar · each subtopic is a notes page in this topic" onclick="plRevealInNotes('${ns.id}', ${s.noteTopicId ? `'${s.noteTopicId}'` : "null"})">📒 ${escapeHtml(ns.name)} › ${escapeHtml(f ? f.topic.name : plStripGs(s.name))}</span>`;
}
/* Open the subject (and topic) in the notes sidebar and scroll to it. */
function plRevealInNotes(subjectId, topicId) {
  ui.collapsedSubjects[subjectId] = false;
  if (topicId) ui.collapsedTopics[topicId] = false;
  if (ui.sidebarHidden) ui.sidebarHidden = false;
  saveUiPrefs();
  render();
  const el = document.getElementById(topicId ? `nav-topic-${topicId}` : "sidebar");
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function plRenderLog() {
  const el = document.getElementById("pl-log");
  if (!el) return;
  const ds = Object.keys(planner.days).filter((d) => plIsLogged(planner.days[d])).sort().reverse();
  if (!ds.length) { el.innerHTML = `<div class="weak-empty">Nothing logged yet. Fill in today's targets above and they appear here.</div>`; return; }
  const merged = typeof mergedTimeLog === "function" ? mergedTimeLog() : {};
  el.innerHTML = `<div class="pl-tbl"><table class="mt-table">
    <tr><th>Date</th>${PL_TRACKS.map((t) => `<th>${t.n}</th>`).join("")}<th>Note</th><th>Timer</th></tr>
    ${ds.map((d) => { const e = planner.days[d]; return `<tr>
      <td class="pl-dt"><a href="#" onclick="event.preventDefault(); plPickDay('${d}'); document.getElementById('pl-day-title').scrollIntoView({behavior:'smooth'})">${plFmt(d)}</a></td>
      ${PL_TRACKS.map((t) => { const te = (e.tracks || {})[t.k] || {}; return `<td>${te.target ? escapeHtml(te.target) : `<span class="pl-s">—</span>`}
        ${te.subject ? `<span class="pl-s">${escapeHtml(te.subject)}${te.topic ? " · " + plTopicList(te.topic).map(escapeHtml).join(", ") : ""}</span>` : ""}
        ${te.done ? `<span class="pl-ok">✓ done</span>` : ""}</td>`; }).join("")}
      <td>${escapeHtml(e.note || "")}</td>
      <td>${plMinutes(merged[d] || 0) || `<span class="pl-s">—</span>`}</td>
    </tr>`; }).join("")}
  </table></div>`;
}

/* ------------------------------ actions ------------------------------ */
function plPickDay(v) { if (!v) return; plFlushDaySave(); plDay = v; plRenderDay(); }
function plSetNote(v) { plEntry(plDay).note = v; plQueueDaySave(); }
function plToggleBpscMode(m) {
  const te = plEntry(plDay).tracks.bpsc;
  const cur = String(te.subject || "").split(",").map((x) => x.trim()).filter(Boolean);
  te.subject = ["Prelims", "Mains"].filter((x) => (x === m ? !cur.includes(x) : cur.includes(x))).join(", ");
  plQueueDaySave(); plRenderDay();
}
function plSetField(track, field, value, typing) {
  const te = plEntry(plDay).tracks[track];
  te[field] = value;
  if (field === "subject") { te.topic = ""; te.doneTopics = ""; te.carried = ""; plPickOpen[track] = false; }
  plQueueDaySave();
  if (!typing && (field === "subject" || field === "topic")) plRenderDay();
}
function plSetDate(key, value) {
  planner.settings[key] = value;
  api("PATCH", "/api/planner/settings", { [key]: value }).then(plRenderStats);
}
function plCycle(id) {
  const s = plFindSubject(id); if (!s) return;
  const next = s.status === "todo" ? "current" : s.status === "current" ? "done" : "todo";
  api("PATCH", `/api/planner/subjects/${id}`, { status: next }).then(plReload);
}
function plMoveSubject(id) { api("POST", `/api/planner/subjects/${id}/move-up`).then(plReload); }
function plDeleteSubject(id) {
  const s = plFindSubject(id); if (!s) return;
  if (!confirm(`Stop tracking "${s.name}" in the plan?\n\nIts topic and subtopics stay in your notes, and days already logged keep their text.`)) return;
  api("DELETE", `/api/planner/subjects/${id}`).then(plReload);
}
function plAddSubject(track, input, sel) {
  const v = input.value.trim(); if (!v) return;
  const body = { track, name: v };
  if (sel && sel.value !== "auto") body.noteSubjectId = sel.value;
  api("POST", "/api/planner/subjects", body).then(plReload);
}
function plToggleTopics(id) { plOpenTopics.has(id) ? plOpenTopics.delete(id) : plOpenTopics.add(id); plRenderSubjects(); }
function plAddTopics(subjectId, input) {
  const names = input.value.split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (!names.length) return;
  api("POST", `/api/planner/subjects/${subjectId}/topics`, { names }).then(plReload);
}
function plPasteTopics(ev, subjectId, input) {
  const txt = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
  if (!txt.includes("\n")) return;
  ev.preventDefault();
  input.value = txt;
  plAddTopics(subjectId, input);
}
function plToggleTopic(subjectId, topicId, done) {
  const s = plFindSubject(subjectId);
  const x = s && s.topics.find((t) => t.id === topicId);
  if (x) x.done = done;
  // Ticking a linked topic records a revision, so refresh the Due count too.
  api("PATCH", `/api/planner/topics/${topicId}`, { done }).then(plReload);
}
function plSetNoteTarget(subjectId, noteSubjectId) {
  api("PATCH", `/api/planner/subjects/${subjectId}`, { noteSubjectId }).then(plReload);
}
function plPush(subjectId) { api("POST", `/api/planner/subjects/${subjectId}/push`).then(plReload); }
function plMoveTopic(id) { api("POST", `/api/planner/topics/${id}/move-up`).then(plReload); }
async function plDeleteTopic(id) {
  // The subtopic is the same item in your notes, so warn about what goes with it.
  let msg = "Delete this subtopic?";
  try {
    const { notes } = await api("GET", `/api/planner/topics/${id}/impact`);
    if (notes) {
      const parts = [];
      if (notes.bullets) parts.push(`${notes.bullets} bullet${notes.bullets === 1 ? "" : "s"}`);
      if (notes.pyqs) parts.push(`${notes.pyqs} PYQ${notes.pyqs === 1 ? "" : "s"}`);
      if (notes.attachments) parts.push(`${notes.attachments} attachment${notes.attachments === 1 ? "" : "s"}`);
      msg = `Delete "${notes.name}"?\n\nIts notes page is deleted too` + (parts.length ? `, with ${parts.join(", ")}.` : " (nothing is written in it yet).");
    }
  } catch (e) { /* fall back to the plain question */ }
  if (!confirm(msg)) return;
  api("DELETE", `/api/planner/topics/${id}`).then(plReload);
}
