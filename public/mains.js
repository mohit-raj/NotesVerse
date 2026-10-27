/* NotesVerse, simplified: per-subtopic PYQs + themes, hard-copy notes upload, simple dashboard.
   Loaded after app.js; replaces the page, dashboard and render functions. */
let themeData = [];
const thKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const thSplit = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const esc2 = (s) => escapeHtml(String(s == null ? "" : s));
const attr = (s) => esc2(s).replace(/'/g, "&#39;");

async function loadThemes() { try { themeData = await api("GET", "/api/themes"); } catch (e) { themeData = []; } }
const _refreshTree = refreshTree;
refreshTree = async function () { await _refreshTree(); await loadThemes(); };

/* ---------- data helpers ---------- */
function allPyqs() {
  const out = [];
  allMicrothemes().forEach(({ mt, subject }) => (mt.pyqs || []).forEach((p) => out.push({ ...p, mt, subject })));
  return out;
}
function themeIndex() {
  // every theme: from questions, plus created/written ones
  const map = new Map();
  const get = (name) => { const k = thKey(name); if (!k) return null; if (!map.has(k)) map.set(k, { key: k, name: String(name).trim(), qs: [], items: [] });
    const e = map.get(k); if (e.name === e.name.toLowerCase() && String(name) !== String(name).toLowerCase()) e.name = String(name).trim(); return e; };
  allPyqs().forEach((p) => thSplit(p.themes).forEach((t) => { const e = get(t); if (e) e.qs.push(p); }));
  themeData.forEach((t) => { const e = get(t.name); if (e) e.items = t.items || []; });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function themeChips(list, mtId) {
  return thSplit(list).map((t) => `<span class="th-chip" onclick="event.stopPropagation();openTheme('${attr(thKey(t))}')">${esc2(t)}</span>`).join("");
}

/* ---------- navigation ---------- */
let curTheme = null; try { curTheme = localStorage.getItem("uv_theme_key"); } catch (e) {}
function openThemes() { ui.currentView = "themes"; saveUiPrefs(); render(); }
function openTheme(k) { curTheme = k; try { localStorage.setItem("uv_theme_key", k); } catch (e) {} ui.currentView = "theme"; saveUiPrefs(); render(); window.scrollTo(0, 0); const c = document.getElementById("main"); if (c) c.scrollTop = 0; }

render = function () {
  document.getElementById("sidebar").classList.toggle("collapsed", ui.sidebarHidden);
  document.body.classList.toggle("sidebar-hidden", ui.sidebarHidden);
  renderSidebar(); renderTopbar();
  if (ui.currentView === "dashboard") renderDashboard();
  else if (ui.currentView === "planner") renderPlanner();
  else if (ui.currentView === "themes") renderThemesIndex();
  else if (ui.currentView === "theme") renderThemePage();
  else renderMicrotheme();
};

/* ---------- subtopic page ---------- */
renderMicrotheme = function () {
  const mt = getCurrentMT();
  const c = document.getElementById("content");
  if (!mt) { c.innerHTML = "<p style='padding:24px;font-family:-apple-system,sans-serif;color:var(--muted)'>Pick a subtopic from the left, or add a subject to get started.</p>"; return; }
  const qs = (mt.pyqs || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  const themesHere = new Map();
  qs.forEach((p) => thSplit(p.themes).forEach((t) => { const k = thKey(t); themesHere.set(k, { name: t, n: (themesHere.get(k) || { n: 0 }).n + 1 }); }));

  let html = `<h1 class="page-title">${esc2(mt.name)}</h1>`;
  html += boxOpen("pyqs-" + mt.id, `PYQs (${qs.length})`);
  html += qs.length ? `<table class="pyq-table">
      <tr><th style="width:110px">Year · Marks</th><th>Question</th><th style="width:30%">Themes</th><th style="width:90px"></th></tr>
      ${qs.map((p) => `<tr>
        <td>${p.year || "–"}${p.marks ? " · " + p.marks + "m" : ""}</td>
        <td>${mdToHtml(p.question || "")}</td>
        <td>${themeChips(p.themes) || `<span style="color:var(--muted)">no theme</span>`}</td>
        <td class="item-actions" style="opacity:.8;white-space:nowrap"><span onclick="pyqModal('${mt.id}','${p.id}')">edit</span><span onclick="removePyq('${p.id}')">del</span></td>
      </tr>`).join("")}
    </table>` : `<div class="weak-empty">No questions yet. Add the PYQs asked on this subtopic.</div>`;
  html += `<div class="add-item-btn" onclick="pyqModal('${mt.id}')">+ Add PYQ</div>`;
  html += boxClose;

  if (themesHere.size) {
    html += boxOpen("themes-" + mt.id, "Themes asked here");
    html += `<div class="th-row">${[...themesHere].map(([k, t]) => `<span class="th-chip big" onclick="openTheme('${attr(k)}')">${esc2(t.name)} <b>${t.n}</b></span>`).join("")}</div>
      <div class="weak-empty" style="margin-top:8px">Click a theme to see all its questions and write your content for it.</div>`;
    html += boxClose;
  }

  html += renderAttachmentsBox(mt).replace("📎 Attachments — handwritten notes &amp; scans", "📎 Hard-copy notes").replace("📎 Attachments — handwritten notes & scans", "📎 Hard-copy notes").replace("No handwritten notes or scans uploaded yet.", "Upload photos or PDFs of your hard-copy notes here.");

  html += `<div style="margin:18px 0;display:flex;gap:8px;flex-wrap:wrap">
    ${ui.timer && ui.timer.status !== "stopped" && ui.timer.mtId === mt.id ? `<span class="btn ghost">⏱ Timer running</span>` : `<span class="btn solid" onclick="startTimer('${mt.id}')">▶ Start timer</span>`}
    <span class="btn" onclick="exportMicrothemePDF('${mt.id}')">🖨 Export as PDF</span>
    <span class="btn danger" onclick="deleteMicrotheme('${mt.id}')">🗑 Delete subtopic</span></div>`;
  c.innerHTML = html;
};

/* ---------- add / edit PYQ ---------- */
function pyqModal(mtId, pyqId) {
  const found = findMicrotheme(mtId); if (!found) return;
  const cur = pyqId ? (found.mt.pyqs || []).find((p) => p.id === pyqId) : null;
  const all = themeIndex();
  const old = document.getElementById("nv-pq"); if (old) old.remove();
  const m = document.createElement("div"); m.id = "nv-pq";
  m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
  m.innerHTML = `<div style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:20px;width:min(680px,95vw);max-height:92vh;overflow:auto;font-family:-apple-system,sans-serif">
    <h3 style="margin:0 0 10px">${cur ? "Edit PYQ" : "Add PYQ"} <span style="font-weight:400;opacity:.7">· ${esc2(found.mt.name)}</span></h3>
    <div style="display:flex;gap:10px;margin-bottom:8px">
      <label style="flex:1">Year<input id="pq-y" class="nv-in" type="number" value="${cur ? cur.year || "" : ""}" placeholder="2023"></label>
      <label style="flex:1">Marks<input id="pq-m" class="nv-in" type="number" value="${cur ? cur.marks || "" : "10"}" placeholder="10"></label>
    </div>
    <label>Question<textarea id="pq-q" class="nv-in" rows="5" placeholder="Paste the question">${cur ? esc2(cur.question) : ""}</textarea></label>
    <label style="display:block;margin-top:8px">Themes <span style="opacity:.7">(separate with commas; click a suggestion to add it)</span>
      <input id="pq-t" class="nv-in" value="${cur ? attr(cur.themes || "") : ""}" placeholder="e.g. Naxalism, Tribal rights"></label>
    <div id="pq-sug" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${all.map((t) => `<span class="th-chip" data-n="${attr(t.name)}">${esc2(t.name)}</span>`).join("") || `<span style="opacity:.6">No themes yet. Type the first one above.</span>`}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="pq-c">Cancel</button>${cur ? "" : `<button class="btn" id="pq-sn">Save &amp; add another</button>`}<button class="btn solid" id="pq-s">Save</button></div></div>`;
  document.body.appendChild(m);
  const T = m.querySelector("#pq-t");
  m.querySelectorAll("#pq-sug .th-chip").forEach((ch) => ch.onclick = () => {
    const parts = thSplit(T.value); const n = ch.dataset.n;
    T.value = parts.some((x) => thKey(x) === thKey(n)) ? parts.filter((x) => thKey(x) !== thKey(n)).join(", ") : parts.concat(n).join(", ");
  });
  m.querySelector("#pq-c").onclick = () => m.remove();
  const save = async (again) => {
    const body = { year: m.querySelector("#pq-y").value, marks: m.querySelector("#pq-m").value, question: m.querySelector("#pq-q").value.trim(), themes: T.value };
    if (!body.question) { m.querySelector("#pq-q").focus(); return; }
    if (cur) await api("PATCH", `/api/pyqs/${cur.id}`, body); else await api("POST", "/api/pyqs", { microthemeId: mtId, ...body });
    m.remove(); await refreshTree(); render();
    if (again) pyqModal(mtId);
  };
  m.querySelector("#pq-s").onclick = () => save(false);
  const sn = m.querySelector("#pq-sn"); if (sn) sn.onclick = () => save(true);
  setTimeout(() => m.querySelector(cur ? "#pq-q" : "#pq-y").focus(), 30);
}
function removePyq(id) { if (confirm("Delete this question?")) mutate("DELETE", `/api/pyqs/${id}`); }

/* ---------- themes ---------- */
let themeViewMode = "subject"; try { themeViewMode = localStorage.getItem("uv_thview") || "subject"; } catch (e) {}
function setThemeView(m) { themeViewMode = m; try { localStorage.setItem("uv_thview", m); } catch (e) {} renderThemesIndex(); }
function renderThemesIndex() {
  const c = document.getElementById("content");
  const th = themeIndex();
  let html = `<h1 class="page-title">Themes</h1><div class="page-tag">Themes asked in each subtopic. Click a theme to see all its questions and write your content for it.</div>
    <div style="margin:14px 0;display:flex;gap:8px;flex-wrap:wrap"><span class="btn small ${themeViewMode === "subject" ? "solid" : ""}" onclick="setThemeView('subject')">By subject</span><span class="btn small ${themeViewMode === "az" ? "solid" : ""}" onclick="setThemeView('az')">A–Z</span><span class="btn small" onclick="newTheme()">+ New theme</span></div>`;
  if (!th.length) { c.innerHTML = html + `<div class="weak-empty">No themes yet. Add a PYQ and give it a theme.</div>`; return; }
  const card = (t, n) => `<div class="th-card" onclick="openTheme('${attr(t.key)}')"><div class="th-card-name">${esc2(t.name)}</div><div class="th-card-sub">${n != null ? n : t.qs.length} question${(n != null ? n : t.qs.length) === 1 ? "" : "s"}${t.items.length ? " · content written" : ""}</div></div>`;
  if (themeViewMode === "az") html += `<div class="th-grid">${th.map((t) => card(t)).join("")}</div>`;
  else {
    const used = new Set();
    tree.forEach((subj) => {
      const topicName = (id) => { const t = (subj.topics || []).find((x) => x.id === id); return t ? t.name : ""; };
      const groups = new Map(); // topic -> [{mt, themes}]
      subj.microthemes.forEach((mt) => {
        const cnt = new Map();
        (mt.pyqs || []).forEach((p) => thSplit(p.themes).forEach((t) => { const k = thKey(t); cnt.set(k, (cnt.get(k) || 0) + 1); used.add(k); }));
        if (!cnt.size) return;
        const tn = topicName(mt.topicId) || "";
        if (!groups.has(tn)) groups.set(tn, []);
        groups.get(tn).push({ mt, cnt });
      });
      if (!groups.size) return;
      html += `<div class="box-section"><div class="box-header" style="cursor:default"><span class="box-title">${esc2(subj.name)}</span></div><div class="box-body">`;
      groups.forEach((pages, tn) => {
        if (tn) html += `<div class="th-topic">${esc2(tn)}</div>`;
        pages.forEach(({ mt, cnt }) => {
          html += `<div class="th-page"><a href="#" class="th-page-name" onclick="openMicrotheme('${mt.id}');return false;">${esc2(mt.name)}</a><div class="th-row">${[...cnt].map(([k, n]) => { const t = th.find((x) => x.key === k); return `<span class="th-chip big" onclick="openTheme('${attr(k)}')">${esc2(t ? t.name : k)} <b>${n}</b></span>`; }).join("")}</div></div>`;
        });
      });
      html += `</div></div>`;
    });
    const loose = th.filter((t) => !used.has(t.key));
    if (loose.length) html += `<h2 class="plain-head">Themes with no question yet</h2><div class="th-grid">${loose.map((t) => card(t)).join("")}</div>`;
  }
  c.innerHTML = html;
}
async function newTheme() {
  const n = prompt("Theme name:"); if (!n || !n.trim()) return;
  const r = await api("POST", "/api/themes", { name: n }); await refreshTree(); openTheme(r.key);
}
function renderThemePage() {
  const c = document.getElementById("content");
  const t = themeIndex().find((x) => x.key === curTheme);
  if (!t) { ui.currentView = "themes"; return renderThemesIndex(); }
  const qs = t.qs.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
  let html = `<h1 class="page-title">🏷 ${esc2(t.name)}</h1>
    <div style="display:flex;gap:8px;margin:6px 0 4px;flex-wrap:wrap"><span class="btn small" onclick="renameTheme('${attr(t.key)}')">✎ Rename</span><span class="btn small" onclick="exportMicrothemePDF()">🖨 Export as PDF</span><span class="btn small danger" onclick="deleteTheme('${attr(t.key)}')">🗑 Delete theme</span></div>`;
  const yrs = [...new Set(qs.map((p) => p.year).filter(Boolean))].sort((a, b) => b - a);
  const subs = new Set(qs.map((p) => p.mt.id));
  if (qs.length) html += `<div class="page-tag" style="margin:8px 0 2px">Asked ${qs.length} time${qs.length === 1 ? "" : "s"} · ${yrs.join(", ") || "year not set"} · across ${subs.size} subtopic${subs.size === 1 ? "" : "s"}</div>`;
  html += boxOpen("thq-" + t.key, `Questions on this theme (${qs.length})`);
  html += qs.length ? `<table class="pyq-table"><tr><th style="width:110px">Year · Marks</th><th>Question</th><th style="width:26%">Subtopic</th></tr>
    ${qs.map((p) => `<tr><td>${p.year || "–"}${p.marks ? " · " + p.marks + "m" : ""}</td><td>${mdToHtml(p.question || "")}</td>
      <td><a href="#" onclick="openMicrotheme('${p.mt.id}');return false;">${esc2(p.mt.name)}</a><div style="font-size:12px;color:var(--muted)">${esc2(p.subject.name)}</div></td></tr>`).join("")}</table>`
    : `<div class="weak-empty">No PYQ carries this theme yet.</div>`;
  html += boxClose;
  html += boxOpen("thn-" + t.key, "My content for this theme");
  html += `<div class="weak-empty" style="margin-bottom:6px">Write everything for this theme in one place: points from every question, answers, examples, keywords.</div>`;
  html += `<ul class="item-list">${t.items.map((it, i, arr) => themeItemHtml(it, arr[i + 1] && (arr[i + 1].indent || 0) > (it.indent || 0))).join("")}</ul>
    <div class="add-item-btn" onclick="themeAdd()">+ Add bullet</div>`;
  html += boxClose;
  c.innerHTML = html;
}
function themeItemHtml(it, grp) {
  return `<li class="${it.indent ? "indent indent-" + it.indent : ""}${grp ? " grp" : ""}"><span class="item-body">${itemBodyHtml(it.text)}</span>
    <span class="item-actions"><span title="Make it a main point" onclick="themeIndent('${it.id}',-1)">←</span><span title="Make it a sub-point" onclick="themeIndent('${it.id}',1)">→</span><span onclick="themeEdit('${it.id}')">edit</span><span onclick="themeDel('${it.id}')">del</span></span></li>`;
}
function themeFind(id) { const t = themeIndex().find((x) => x.key === curTheme); return t ? t.items.find((i) => i.id === id) : null; }
function themeAdd() { nvEditor({ theme: curTheme, mode: "bullets" }); }
function themeEdit(id) { const it = themeFind(id); if (it) nvEditor({ theme: curTheme, itemId: id, text: it.text, base: it.indent || 0, mode: "edit" }); }
async function themeIndent(id, d) { const it = themeFind(id); if (!it) return; const n = Math.max(0, Math.min(2, (it.indent || 0) + d)); if (n !== (it.indent || 0)) { await api("PATCH", `/api/theme-items/${id}`, { indent: n }); await refreshTree(); render(); } }
async function themeDel(id) { await api("DELETE", `/api/theme-items/${id}`); await refreshTree(); render(); }
async function renameTheme(k) {
  const t = themeIndex().find((x) => x.key === k); const n = prompt("Rename theme (it changes on every question that has it):", t ? t.name : ""); if (!n || !n.trim()) return;
  const r = await api("POST", "/api/themes/rename", { from: k, to: n }); await refreshTree(); openTheme(r.key);
}
async function deleteTheme(k) {
  if (!confirm("Delete this theme? It is removed from every question, and the content you wrote under it is deleted. The questions themselves stay.")) return;
  await api("DELETE", `/api/themes/${encodeURIComponent(k)}`); await refreshTree(); openThemes();
}

/* ---------- dashboard ---------- */
renderDashboard = function () {
  const c = document.getElementById("content");
  let html = `<div class="dash-hero"><h1>Dashboard</h1><p>Your subtopics, PYQs and themes</p>
    <div class="search-row"><input type="text" id="search-input" class="search-input" placeholder="Search PYQs, themes, subtopics…" value="${esc2(ui.searchQuery || "")}" onkeydown="if(event.key==='Enter'){runSearch(this.value);}">
      <span class="btn small solid" onclick="runSearch(document.getElementById('search-input').value)">🔍 Search</span>${ui.searchQuery ? `<span class="btn small" onclick="clearSearch()">✕ Clear</span>` : ""}</div></div>`;
  if (ui.searchQuery && ui.searchQuery.trim()) { c.innerHTML = html + renderSearchResults(ui.searchQuery.trim()); const i = document.getElementById("search-input"); if (i && ui.focusSearch) { i.focus(); ui.focusSearch = false; } return; }
  const pages = allMicrothemes(), qs = allPyqs(), th = themeIndex();
  html += `<div class="cards-row">
    <div class="dcard"><div class="num">${pages.length}</div><div class="lab">SUBTOPICS</div></div>
    <div class="dcard"><div class="num">${qs.length}</div><div class="lab">PYQs ADDED</div></div>
    <div class="dcard"><div class="num">${th.length}</div><div class="lab">THEMES</div></div>
    <div class="dcard" title="Questions that have no theme yet"><div class="num">${qs.filter((p) => !thSplit(p.themes).length).length}</div><div class="lab">PYQs WITHOUT THEME</div></div></div>`;
  const noQ = pages.filter(({ mt }) => !(mt.pyqs || []).length), noHc = pages.filter(({ mt }) => !(mt.attachments || []).length);
  if (noQ.length || noHc.length) {
    const chips = (arr) => arr.slice(0, 40).map(({ mt }) => `<span class="th-chip" onclick="openMicrotheme('${mt.id}')">${esc2(mt.name)}</span>`).join("") + (arr.length > 40 ? ` <span style="color:var(--muted)">+${arr.length - 40} more</span>` : "");
    html += `<h2 class="plain-head">✅ Still to fill</h2><div class="box-section"><div class="box-body">
      ${noQ.length ? `<div class="th-topic">No PYQs added yet (${noQ.length})</div><div class="th-row">${chips(noQ)}</div>` : ""}
      ${noHc.length ? `<div class="th-topic" style="margin-top:14px">No hard-copy notes uploaded (${noHc.length})</div><div class="th-row">${chips(noHc)}</div>` : ""}</div></div>`;
  }
  html += `<h2 class="plain-head">🏷 Themes</h2>`;
  html += th.length ? `<div class="th-row">${th.slice().sort((a, b) => b.qs.length - a.qs.length).map((t) => `<span class="th-chip big" onclick="openTheme('${attr(t.key)}')">${esc2(t.name)} <b>${t.qs.length}</b></span>`).join("")}</div>` : `<div class="weak-empty">No themes yet.</div>`;
  html += `<h2 class="plain-head">📚 Subtopics</h2>`;
  tree.forEach((subj) => {
    if (!subj.microthemes.length) return;
    html += `<div class="box-section"><div class="box-header" style="cursor:default"><span class="box-title">${esc2(subj.name)}</span></div><div class="box-body" style="padding:6px 8px">
      <table class="mt-table"><tr><th>Subtopic</th><th style="width:90px">PYQs</th><th style="width:90px">Themes</th><th style="width:100px">Hard copy</th></tr>
      ${subj.microthemes.map((mt) => { const ths = new Set(); (mt.pyqs || []).forEach((p) => thSplit(p.themes).forEach((t) => ths.add(thKey(t))));
        return `<tr style="cursor:pointer" onclick="openMicrotheme('${mt.id}')"><td>${esc2(mt.name)}</td><td>${(mt.pyqs || []).length}</td><td>${ths.size}</td><td>${(mt.attachments || []).length ? "✓ " + mt.attachments.length : "–"}</td></tr>`; }).join("")}
      </table></div></div>`;
  });
  let last = null; try { last = localStorage.getItem("uv_last_backup"); } catch (e) {}
  const days = last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null;
  html += `<h2 class="plain-head">💾 Your data</h2><div class="box-section"><div class="box-body">
    <div style="font:14px -apple-system,sans-serif;margin-bottom:10px;${days === null || days > 7 ? "color:var(--red);font-weight:600" : "color:var(--muted)"}">${days === null ? "You have not taken a backup yet." : days === 0 ? "Last backup: today." : `Last backup: ${days} day${days === 1 ? "" : "s"} ago.`}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn solid" href="/api/backup/export" onclick="try{localStorage.setItem('uv_last_backup',new Date().toISOString())}catch(e){}; setTimeout(()=>renderDashboard(),600)" style="text-decoration:none">⬇ Download backup</a>
      <span class="btn" onclick="restoreBackup()">⬆ Restore from backup file</span></div>
    <div style="font:12.5px -apple-system,sans-serif;color:var(--muted);margin-top:8px">The backup is one .zip file with all your data: subtopics, PYQs, themes, Micro Plan, PYQ Bank, to-do note, study hours, <b>and</b> all your uploaded photos and PDFs. (Your password and API key in config.json are not included.) Keep it somewhere safe (Drive, pen drive). Restoring only adds or updates; it never deletes.</div>
  </div></div>`;
  c.innerHTML = html;
};
function restoreBackup() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".zip,.json";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (!confirm("Restore this backup? Existing items with the same id are updated; nothing is deleted.")) return;
    try {
      let r;
      if (/\.zip$/i.test(f.name)) {
        const res = await fetch("/api/backup/restore-zip", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await f.arrayBuffer() });
        if (!res.ok) throw new Error(await res.text()); r = await res.json();
      } else r = await api("POST", "/api/backup/restore", { data: JSON.parse(await f.text()) });
      alert(`Restored ${r.restored} records${r.files != null ? " and " + r.files + " files" : ""}.`); await refreshTree(); render();
    } catch (e) { alert("Could not restore: " + e.message); }
  };
  inp.click();
}
renderSearchResults = function (q) {
  const L = q.toLowerCase(), has = (t) => String(t || "").toLowerCase().includes(L);
  const pageHits = allMicrothemes().map(({ mt, subject }) => ({ mt, subject, hits: (mt.pyqs || []).filter((p) => has(p.question) || has(p.themes)) })).filter((r) => r.hits.length || has(r.mt.name));
  const thHits = themeIndex().filter((t) => has(t.name) || t.items.some((i) => has(i.text)));
  if (!pageHits.length && !thHits.length) return `<div class="weak-empty" style="margin-top:20px;">No matches for "${esc2(q)}".</div>`;
  let html = "";
  if (thHits.length) html += `<h2 class="plain-head">Themes</h2><div class="th-row">${thHits.map((t) => `<span class="th-chip big" onclick="openTheme('${attr(t.key)}')">${esc2(t.name)} <b>${t.qs.length}</b></span>`).join("")}</div>`;
  pageHits.forEach(({ mt, subject, hits }) => {
    html += `<div class="search-result" onclick="openMicrotheme('${mt.id}')"><div class="search-result-head"><span class="sb-crumb">${esc2(subject.name)}</span> · <b>${esc2(mt.name)}</b></div>
      ${hits.slice(0, 4).map((p) => `<div class="search-hit-row"><span class="search-hit-label">${p.year || ""}:</span> ${highlightHit(stripMdForSnippet(p.question || ""), q)}</div>`).join("")}</div>`;
  });
  return html;
};

/* ---------- export ---------- */
exportMicrothemePDF = function () {
  printRestore = { skeleton: false, test: false, collapsedSections: ui.collapsedSections, expandedAspects: ui.expandedAspects };
  document.body.classList.add("print-mode"); setTimeout(() => window.print(), 150);
};

loadThemes().then(() => { if (ui.currentView === "theme" || ui.currentView === "themes" || ui.currentView === "dashboard") render(); });
if ((ui.currentView === "theme" && !curTheme)) ui.currentView = "dashboard";
