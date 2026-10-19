/* ============================= STATE ============================= */
let tree = [];
let dashboardNotes = "";
let notesSaveTimer = null;
let chatOpen = false;
let chatMessages = [];
let chatSending = false;
let authEnabled = false;
let ui = {
  darkMode: localStorage.getItem("uv_dark") === "1",
  currentView: localStorage.getItem("uv_view") || "microtheme",
  currentMicrotheme: localStorage.getItem("uv_mt") || null,
  test: false,
  skeleton: false,
  revealed: {},
  expandedAspects: {},
  editingAspectContent: null,
  searchQuery: "",
  focusSearch: false,
  dashFilterDue: false,
  notesEditing: false,
  timer: JSON.parse(localStorage.getItem("uv_timer") || 'null') || { mtId: null, mtName: "", status: "stopped", studyMs: 0, breakMs: 0, segmentStart: null },
  collapsedSections: JSON.parse(localStorage.getItem("uv_collapsed_sections") || "{}"),
  collapsedSubjects: JSON.parse(localStorage.getItem("uv_collapsed_subjects") || "{}"),
  collapsedTopics: JSON.parse(localStorage.getItem("uv_collapsed_topics") || "{}"),
  sidebarHidden: localStorage.getItem("uv_sidebar_hidden") === "1"
};

function saveUiPrefs() {
  localStorage.setItem("uv_dark", ui.darkMode ? "1" : "0");
  localStorage.setItem("uv_view", ui.currentView);
  if (ui.currentMicrotheme) localStorage.setItem("uv_mt", ui.currentMicrotheme);
  localStorage.setItem("uv_collapsed_sections", JSON.stringify(ui.collapsedSections));
  localStorage.setItem("uv_collapsed_subjects", JSON.stringify(ui.collapsedSubjects));
  localStorage.setItem("uv_collapsed_topics", JSON.stringify(ui.collapsedTopics));
  localStorage.setItem("uv_sidebar_hidden", ui.sidebarHidden ? "1" : "0");
}
function saveTimerState() {
  localStorage.setItem("uv_timer", JSON.stringify(ui.timer));
}

/* ============================= API HELPERS ============================= */
async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    showSaveError("Couldn't reach the server. Is it still running? Your last change was NOT saved.");
    throw e;
  }
  if (!res.ok) {
    const msg = await res.text();
    showSaveError("Save failed: " + msg);
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function refreshTree() { tree = await api("GET", "/api/tree"); }
async function loadDashboardNotes() {
  try {
    const res = await api("GET", "/api/notes");
    dashboardNotes = res && res.content ? res.content : "";
  } catch (e) { dashboardNotes = ""; }
}
async function loadAuthStatus() {
  try {
    const res = await fetch("/api/auth-status");
    const data = await res.json();
    authEnabled = !!data.enabled;
  } catch (e) { authEnabled = false; }
}
function doLogout() {
  fetch("/api/logout", { method: "POST" }).finally(() => { window.location.href = "/login.html"; });
}
function onNotesInput(value) {
  dashboardNotes = value;
  updateNotesSaveIndicator("saving");
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(saveDashboardNotes, 900);
}
function flushNotesSave() {
  clearTimeout(notesSaveTimer);
  saveDashboardNotes();
}
function saveDashboardNotes() {
  api("PATCH", "/api/notes", { content: dashboardNotes })
    .then(() => updateNotesSaveIndicator("saved"))
    .catch(() => updateNotesSaveIndicator("error"));
}
function updateNotesSaveIndicator(state) {
  const el = document.getElementById("notes-save-indicator");
  if (!el) return;
  if (state === "saving") el.textContent = "Saving…";
  else if (state === "saved") el.textContent = "Saved ✓";
  else el.textContent = "⚠ Not saved";
}
function toggleNotesEdit(edit) {
  ui.notesEditing = edit;
  renderSidebar();
  if (edit) {
    setTimeout(() => {
      const el = document.getElementById("dashboard-notes");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  }
}
function handleNotesBlur() {
  flushNotesSave();
  ui.notesEditing = false;
  renderSidebar();
}
function renderNotesPreview(text) {
  const lines = (text || "").split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (!inList) { html += `<ul class="notes-list">`; inList = true; }
      html += `<li>${mdToHtml(trimmed.slice(2))}</li>`;
    } else {
      if (inList) { html += `</ul>`; inList = false; }
      html += trimmed === "" ? `<div class="notes-blank">&nbsp;</div>` : `<div class="notes-line">${mdToHtml(trimmed)}</div>`;
    }
  });
  if (inList) html += `</ul>`;
  if (!html) html = `<div class="notes-placeholder">Click to jot todos, reminders, quick thoughts…</div>`;
  return html;
}
function renderStickyNote() {
  if (ui.notesEditing) {
    return `<div class="sticky-note">
      <div class="sticky-note-head">
        <span>📝 To-do / Notes</span>
        <span id="notes-save-indicator" class="notes-save-indicator">Saved ✓</span>
      </div>
      <textarea id="dashboard-notes" class="sticky-textarea" oninput="onNotesInput(this.value)" onblur="handleNotesBlur()" placeholder="- todo item&#10;plain note line...">${escapeHtml(dashboardNotes)}</textarea>
      <div class="sticky-hint">**bold** __underline__ *italic* ==highlight== {{red:text}} · start a line with "- " for a bullet</div>
    </div>`;
  }
  return `<div class="sticky-note">
    <div class="sticky-note-head"><span>📝 To-do / Notes</span></div>
    <div class="sticky-preview" onclick="toggleNotesEdit(true)">${renderNotesPreview(dashboardNotes)}</div>
  </div>`;
}
async function mutate(method, url, body) {
  await api(method, url, body);
  await refreshTree();
  render();
}
function showSaveError(message) {
  let banner = document.getElementById("save-error-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "save-error-banner";
    document.body.appendChild(banner);
  }
  banner.textContent = "⚠ " + message;
  banner.style.display = "block";
  clearTimeout(showSaveError._t);
  showSaveError._t = setTimeout(() => { banner.style.display = "none"; }, 6000);
}

/* ============================= HELPERS ============================= */
function escapeHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const COLOR_PALETTE = {
  red: "#c0392b", green: "#1c7a4a", blue: "#1a56db", navy: "#1a2a6c",
  orange: "#c2650a", purple: "#7e3af2", grey: "#5b6478", gray: "#5b6478",
  black: "#000000", pink: "#c0267a", teal: "#0d7a72"
};
function mdToHtml(str) {
  let s = escapeHtml(str);
  s = s.replace(/==(.+?)==/g, "<mark>$1</mark>");
  s = s.replace(/\^\^(.+?)\^\^/g, '<span class="blue-hl">$1</span>');
  s = s.replace(/\{\{(\w+):(.+?)\}\}/g, (m, color, text) => `<span style="color:${COLOR_PALETTE[color.toLowerCase()] || "#1a2a6c"}">${text}</span>`);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<u>$1</u>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return s;
}
function starsForYear(year) {
  if (!year) return "";
  if (year >= 2023) return "★★★";
  if (year >= 2020) return "★★";
  return "★";
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function findMicrotheme(id) {
  for (const subj of tree) for (const mt of subj.microthemes) if (mt.id === id) return { mt, subj };
  return null;
}
function getCurrentMT() {
  const found = findMicrotheme(ui.currentMicrotheme);
  return found ? found.mt : null;
}
function allMicrothemes() {
  const list = [];
  tree.forEach((s) => s.microthemes.forEach((mt) => list.push({ mt, subject: s })));
  return list;
}

const REPEAT_INTERVALS = [1, 3, 7, 14, 30, 60];
function nextDueDate(mt) {
  if (!mt.revisions || mt.revisions.length === 0) return todayStr();
  const last = mt.revisions[mt.revisions.length - 1];
  const idx = Math.min(mt.revisions.length - 1, REPEAT_INTERVALS.length - 1);
  const d = new Date(last);
  d.setDate(d.getDate() + REPEAT_INTERVALS[idx]);
  return d.toISOString().slice(0, 10);
}
function isDue(mt) { return nextDueDate(mt) <= todayStr(); }
function mtMastery(mt) {
  if (!mt.aspects || mt.aspects.length === 0) return 0;
  const done = mt.aspects.filter((a) => a.memorised).length;
  return Math.round((done / mt.aspects.length) * 100);
}
function mergedTimeLog() {
  const merged = {};
  allMicrothemes().forEach(({ mt }) => {
    Object.entries(mt.timeLog || {}).forEach(([d, min]) => { merged[d] = (merged[d] || 0) + min; });
  });
  return merged;
}
function computeStreak() {
  const merged = mergedTimeLog();
  let streak = 0;
  let d = new Date();
  if (!merged[todayStr()]) d.setDate(d.getDate() - 1);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (merged[key] && merged[key] > 0) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}
function overallMastery() {
  const all = allMicrothemes();
  let totalAsp = 0, doneAsp = 0;
  all.forEach(({ mt }) => {
    totalAsp += (mt.aspects || []).length;
    doneAsp += (mt.aspects || []).filter((a) => a.memorised).length;
  });
  if (totalAsp === 0) return 0;
  return Math.round((doneAsp / totalAsp) * 100);
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function fmtDateLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function renderTimeLogBox(mt) {
  const entries = Object.entries(mt.timeLog || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const totalMin = entries.reduce((sum, [, m]) => sum + m, 0);
  const boxId = "timelog-" + mt.id;
  let inner = `<div class="timelog-total">Total logged: <b>${(totalMin / 60).toFixed(1)}h</b> (${totalMin} min) across ${entries.length} day${entries.length === 1 ? "" : "s"}</div>`;
  if (entries.length) {
    inner += `<table class="timelog-table">
      ${entries.map(([date, min]) => `
        <tr>
          <td>${fmtDateLong(date)}${date === todayStr() ? ' <span class="due-tag">Today</span>' : ""}</td>
          <td>${min} min</td>
          <td class="timelog-del"><span onclick="removeTimeLogDate('${mt.id}','${date}')">del</span></td>
        </tr>`).join("")}
    </table>`;
  } else {
    inner += `<div class="weak-empty">No time logged yet for this microtheme.</div>`;
  }
  return boxOpen(boxId, "🗓 Time studied — by day") + inner + boxClose;
}
function removeTimeLogDate(mtId, date) {
  if (!confirm(`Remove all logged time for ${fmtDateLong(date)} on this microtheme?`)) return;
  mutate("DELETE", `/api/microthemes/${mtId}/timelog/${date}`);
}

/* ============================= ATTACHMENTS ============================= */
function renderAttachmentsBox(mt) {
  const boxId = "attachments-" + mt.id;
  const atts = mt.attachments || [];
  const hasNonImage = atts.some((a) => !(a.mimeType || "").startsWith("image/"));
  let inner = "";
  if (atts.length) {
    inner += `<div class="attachments-grid">` + atts.map((a) => {
      const url = "/uploads/" + a.filename;
      const isImage = (a.mimeType || "").startsWith("image/");
      if (isImage) {
        return `<div class="attach-item">
          <a href="${url}" target="_blank"><img class="attach-thumb" src="${url}" alt="${escapeHtml(a.originalName)}"></a>
          <div class="attach-name">${escapeHtml(a.originalName)}</div>
          <span class="item-actions" style="opacity:.6;"><span onclick="removeAttachment('${a.id}')">del</span></span>
        </div>`;
      }
      return `<div class="attach-item attach-file">
        <a href="${url}" target="_blank" class="attach-file-link">📄 ${escapeHtml(a.originalName)}</a>
        <span class="item-actions" style="opacity:.6;"><span onclick="removeAttachment('${a.id}')">del</span></span>
      </div>`;
    }).join("") + `</div>`;
    if (hasNonImage) {
      inner += `<div class="print-only-note">Note: attached PDF files are listed by name above but not merged into this export — open them separately if you want them combined.</div>`;
    }
  } else {
    inner += `<div class="weak-empty">No handwritten notes or scans uploaded yet.</div>`;
  }
  inner += `<div class="add-item-btn" style="margin-top:10px;" onclick="triggerAttachmentUpload('${mt.id}')">+ Upload image or PDF</div>`;
  return boxOpen(boxId, "📎 Attachments — handwritten notes & scans") + inner + boxClose;
}

function triggerAttachmentUpload(mtId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,application/pdf";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      alert("That file is over 15MB. Try a smaller photo or a compressed PDF.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      api("POST", "/api/attachments", { microthemeId: mtId, filename: file.name, mimeType: file.type, dataBase64: base64 })
        .then(async () => { await refreshTree(); render(); })
        .catch((err) => alert("Upload failed: " + err.message));
    };
    reader.readAsDataURL(file);
  };
  input.click();
}
function removeAttachment(id) {
  if (confirm("Delete this attachment? This removes the file from disk too.")) mutate("DELETE", `/api/attachments/${id}`);
}

/* ============================= PDF EXPORT ============================= */
let printRestore = null;
function exportMicrothemePDF(mtId) {
  const found = findMicrotheme(mtId);
  if (!found) return;
  const mt = found.mt;

  printRestore = {
    skeleton: ui.skeleton,
    test: ui.test,
    collapsedSections: JSON.parse(JSON.stringify(ui.collapsedSections)),
    expandedAspects: JSON.parse(JSON.stringify(ui.expandedAspects))
  };

  ui.skeleton = false;
  ui.test = false;
  (mt.sections || []).forEach((s) => { ui.collapsedSections[s.id] = false; });
  ui.collapsedSections["pyqs-" + mtId] = false;
  ui.collapsedSections["aspects-" + mtId] = false;
  ui.collapsedSections["timelog-" + mtId] = false;
  ui.collapsedSections["attachments-" + mtId] = false;
  (mt.aspects || []).forEach((a) => { ui.expandedAspects[a.id] = true; });

  document.body.classList.add("print-mode");
  render();
  setTimeout(() => window.print(), 200);
}
window.addEventListener("afterprint", () => {
  if (!printRestore) return;
  ui.skeleton = printRestore.skeleton;
  ui.test = printRestore.test;
  ui.collapsedSections = printRestore.collapsedSections;
  ui.expandedAspects = printRestore.expandedAspects;
  printRestore = null;
  document.body.classList.remove("print-mode");
  render();
});

/* ============================= AI CHAT WIDGET ============================= */
function chatMdToHtml(text) {
  return mdToHtml(text).replace(/\n/g, "<br>");
}
function renderChatWidget() {
  const el = document.getElementById("chat-widget");
  if (!el) return;
  if (!chatOpen) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<div class="chat-panel">
    <div class="chat-header">
      <span>💬 AI Study Assistant</span>
      <span class="chat-close" onclick="toggleChat()">✕</span>
    </div>
    <div class="chat-messages" id="chat-messages">
      ${chatMessages.length ? chatMessages.map((m) => `<div class="chat-msg chat-${m.role}">${chatMdToHtml(m.text)}</div>`).join("") : `<div class="chat-empty">Ask anything — explain a concept, quiz you, help draft an answer. Usage is billed to your own free Gemini API key.</div>`}
      ${chatSending ? `<div class="chat-msg chat-assistant chat-thinking">Thinking…</div>` : ""}
    </div>
    <div class="chat-input-row">
      <textarea id="chat-input" class="chat-input" placeholder="Type a message… (Enter to send, Shift+Enter for new line)" onkeydown="handleChatKeydown(event)"></textarea>
      <span class="btn small solid" onclick="sendChatMessage()">➤</span>
    </div>
  </div>`;
  const box = document.getElementById("chat-messages");
  if (box) box.scrollTop = box.scrollHeight;
}
function toggleChat() {
  chatOpen = !chatOpen;
  renderChatWidget();
  if (chatOpen) {
    setTimeout(() => { const inp = document.getElementById("chat-input"); if (inp) inp.focus(); }, 0);
  }
}
document.addEventListener("click", (e) => {
  if (!chatOpen) return;
  const widget = document.getElementById("chat-widget");
  const trigger = document.getElementById("chat-sidebar-trigger");
  if (!widget) return;
  // Use composedPath (captured at dispatch time, before any DOM mutation)
  // instead of widget.contains(e.target) — the click that OPENS the chat
  // replaces the widget's HTML mid-bubble, so by the time this listener
  // runs, the clicked node may already be gone from the tree and a live
  // containment check would wrongly treat it as an outside click.
  // Also explicitly allow the sidebar trigger button itself — it now
  // lives outside #chat-widget (in the sidebar), so a click there would
  // otherwise always look like an "outside" click and instantly re-close
  // the panel it just opened.
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  const clickedTrigger = trigger && path.includes(trigger);
  if (!path.includes(widget) && !clickedTrigger) {
    chatOpen = false;
    renderChatWidget();
  }
});
function handleChatKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}
function sendChatMessage() {
  const inp = document.getElementById("chat-input");
  if (!inp) return;
  const text = inp.value.trim();
  if (!text || chatSending) return;
  chatMessages.push({ role: "user", text });
  inp.value = "";
  chatSending = true;
  renderChatWidget();

  const payload = chatMessages.map((m) => ({ role: m.role, content: m.text }));
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload })
  })
    .then(async (res) => {
      const data = await res.json();
      chatSending = false;
      if (!res.ok) chatMessages.push({ role: "assistant", text: "⚠ " + (data.error || "Something went wrong.") });
      else chatMessages.push({ role: "assistant", text: data.reply });
      renderChatWidget();
    })
    .catch((err) => {
      chatSending = false;
      chatMessages.push({ role: "assistant", text: "⚠ Couldn't reach the server: " + err.message });
      renderChatWidget();
    });
}

function isSectionCollapsed(secId) { return !!ui.collapsedSections[secId]; }
function isSubjectCollapsed(subjId) {
  if (ui.collapsedSubjects[subjId] !== undefined) return ui.collapsedSubjects[subjId];
  const active = findMicrotheme(ui.currentMicrotheme);
  const isActiveSubject = active && active.subj.id === subjId;
  return !isActiveSubject; // default: collapsed, except the subject you're currently in
}
function isTopicCollapsed(topicId) {
  if (ui.collapsedTopics[topicId] !== undefined) return ui.collapsedTopics[topicId];
  const active = findMicrotheme(ui.currentMicrotheme);
  return !(active && active.mt.topicId === topicId); // default: collapsed, except the topic you're in
}

/* ============================= RENDER: SIDEBAR ============================= */
function renderSidebar() {
  const sb = document.getElementById("sidebar");
  const mt = getCurrentMT();
  let html = `<div class="brand-strip"><span class="brand-strip-icon">📓</span><span class="brand-strip-name">Notes<em>Verse</em></span></div>`;

  if (ui.currentView === "microtheme" && mt) {
    const found = findMicrotheme(mt.id);
    const doneAsp = (mt.aspects || []).filter((a) => a.memorised).length;
    const totalAsp = (mt.aspects || []).length;

    html += `<div class="sb-section">
      <div class="sb-crumb">${escapeHtml(found.subj.name)}</div>
      <div class="sb-title">${escapeHtml(mt.name)}</div>
    </div>`;

    html += `<div class="sb-section">
      <div class="stat-label">ASPECTS MEMORISED</div>
      <div class="stat-num">${doneAsp} / ${totalAsp || 0}</div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${totalAsp ? (doneAsp / totalAsp) * 100 : 0}%"></div></div>
    </div>`;

    html += `<div class="sb-section">
      <div class="stat-label">REVISIONS THIS MICROTHEME</div>
      <div class="stat-num">${(mt.revisions || []).length}</div>
      <div class="sb-sub">${(mt.revisions || []).length ? "last on " + fmtDate(mt.revisions[mt.revisions.length - 1]) : "not revised yet"}</div>
      <div style="margin-top:8px;"><span class="btn small solid" onclick="markRevised('${mt.id}')">✓ Mark revised</span></div>
    </div>`;

    const flagged = (mt.sections || []).filter((s) => s.starred);
    html += `<div class="sb-section">
      <div class="stat-label">⚠ WEAK POINTS</div>
      ${flagged.length ? flagged.map((s) => `<div class="sb-sub">★ ${escapeHtml(s.title)}</div>`).join("") : `<div class="weak-empty">None flagged. Tap ☆ on a section to flag it.</div>`}
    </div>`;

    html += `<div class="sb-section">
      <div class="row-between"><span class="stat-label">CONTENT SECTIONS</span></div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <span class="btn small" onclick="expandAllSections('${mt.id}')">⊕ Expand all</span>
        <span class="btn small" onclick="collapseAllSections('${mt.id}')">⊖ Collapse all</span>
      </div>
    </div>`;

    html += `<div class="sb-section" style="border-bottom:none;">
      <div class="stat-label">ASPECTS (tick when memorised)</div>
      ${(mt.aspects || []).map((a) => `
        <div class="aspect-item ${a.memorised ? "done" : ""}">
          <input type="checkbox" ${a.memorised ? "checked" : ""} onchange="toggleAspect('${a.id}', this.checked)">
          <label>${escapeHtml(a.label)}</label>
        </div>`).join("")}
      <div class="nav-add" onclick="addAspect('${mt.id}')">+ Add aspect</div>
    </div>`;
  } else if (ui.currentView === "planner") {
    html += `<div class="sb-section">
      <div class="sb-title">Micro Plan</div>
      <div class="sb-sub">Daily targets for prelims, mains, ethics and optional</div>
    </div>`;
  } else {
    html += `<div class="sb-section">
      <div class="sb-title">Dashboard</div>
      <div class="sb-sub">Overview across every subject</div>
      <div style="margin-top:8px;"><span class="btn small solid" onclick="openPlanner()">🗓 Open Micro Plan</span></div>
    </div>`;
  }

  html += `<div class="nav-tree">`;
  tree.forEach((subj) => {
    const collapsed = isSubjectCollapsed(subj.id);
    html += `<div class="nav-subject">
      <span class="nav-subject-name" onclick="toggleSubjectCollapse('${subj.id}')">📗 ${escapeHtml(subj.name)}</span>
      <span class="nav-subject-btns">
        <span class="sq-btn" onclick="toggleSubjectCollapse('${subj.id}')" title="${collapsed ? "Expand" : "Collapse"}">${collapsed ? "+" : "−"}</span>
        <span class="sq-btn" onclick="addTopic('${subj.id}')" title="Add topic (a folder for notes pages)">📁</span>
        <span class="sq-btn" onclick="addMicrotheme('${subj.id}')" title="Add notes page">＋</span>
      </span>
    </div>`;
    if (!collapsed) {
      const navMt = (m, inTopic) => {
        const active = ui.currentView === "microtheme" && m.id === ui.currentMicrotheme;
        return `<div class="nav-mt ${inTopic ? "nav-mt-in" : ""} ${active ? "active" : ""}" onclick="openMicrotheme('${m.id}')">
          ${isDue(m) ? "🔸 " : ""}${escapeHtml(m.name)}
        </div>`;
      };
      const topicIds = new Set((subj.topics || []).map((t) => t.id));
      (subj.topics || []).forEach((t) => {
        const tc = isTopicCollapsed(t.id);
        const pages = subj.microthemes.filter((m) => m.topicId === t.id);
        html += `<div class="nav-topic" id="nav-topic-${t.id}">
          <span class="nav-topic-name" onclick="toggleTopicCollapse('${t.id}')">${tc ? "▸" : "▾"} ${escapeHtml(t.name)} <span class="nav-topic-count">${pages.length}</span></span>
          <span class="nav-subject-btns">
            <span class="sq-btn" onclick="addMicrotheme('${subj.id}','${t.id}')" title="Add notes page in this topic">＋</span>
            <span class="sq-btn" onclick="renameTopic('${t.id}')" title="Rename topic">✎</span>
            <span class="sq-btn" onclick="deleteTopic('${t.id}')" title="Delete topic (its pages are kept)">✕</span>
          </span>
        </div>`;
        if (!tc) html += pages.map((m) => navMt(m, true)).join("") || `<div class="nav-mt nav-mt-in nav-empty">No pages yet — click ＋</div>`;
      });
      subj.microthemes.filter((m) => !m.topicId || !topicIds.has(m.topicId)).forEach((m) => { html += navMt(m, false); });
    }
  });
  html += `<div class="nav-add" style="padding-left:16px;" onclick="addSubject()">+ Add subject</div>`;
  html += `</div>`;

  html += renderStickyNote();
  html += `<div class="sidebar-chat-trigger" id="chat-sidebar-trigger" onclick="toggleChat()">💬 Ask AI Assistant</div>`;

  sb.innerHTML = html;
}

/* ============================= RENDER: TOPBAR ============================= */
function renderTopbar() {
  const tb = document.getElementById("topbar");
  const mt = getCurrentMT();
  const streak = computeStreak();
  let due = 0, mastery = 0;
  if (ui.currentView === "microtheme" && mt) {
    due = isDue(mt) ? 1 : 0;
    mastery = mtMastery(mt);
  } else {
    due = allMicrothemes().filter(({ mt }) => isDue(mt)).length;
    mastery = overallMastery();
  }
  tb.innerHTML = `
    <div class="topbar-left">
      <div class="pill-stat">🔥 <b>${streak}-day</b> streak</div>
      <div class="pill-stat">📌 Due: <b>${due}</b></div>
      <div class="pill-stat">📊 <b>${mastery}%</b></div>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <span class="btn ${ui.skeleton ? "solid" : ""}" onclick="toggleSkeleton()">📄 Skeleton</span>
      <span class="btn ${ui.test ? "solid" : ""}" onclick="toggleTest()">🧠 Test me</span>
      <span class="btn" onclick="toggleTheme()">${ui.darkMode ? "☀️ Light" : "🌙 Dark"}</span>
      <span class="btn" onclick="openDashboard()">📊 Dashboard</span>
      <span class="btn ${ui.currentView === "planner" ? "solid" : ""}" onclick="openPlanner()">🗓 Micro Plan</span>
      ${authEnabled ? `<span class="btn" onclick="doLogout()">🔒 Log out</span>` : ""}
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${mastery}%"></div></div>
  `;
}

/* ============================= BOX SECTION HELPER ============================= */
function boxOpen(id, title, extraHeaderHtml, starHtml) {
  const collapsed = isSectionCollapsed(id);
  return `<div class="box-section ${collapsed ? "collapsed" : ""}" id="box-${id}">
    <div class="box-header" onclick="toggleSectionCollapse('${id}')">
      ${starHtml || ""}
      <span class="box-title">${escapeHtml(title)}</span>
      ${extraHeaderHtml || ""}
      <span class="box-caret">▾</span>
    </div>
    <div class="box-body">`;
}
const boxClose = `</div></div>`;

/* ============================= RENDER: MICROTHEME ============================= */
function renderMicrotheme() {
  const mt = getCurrentMT();
  const c = document.getElementById("content");
  if (!mt) { c.innerHTML = "<p style='padding:24px;font-family:-apple-system,sans-serif;color:var(--muted)'>Pick a microtheme from the sidebar, or add a new subject to get started.</p>"; return; }

  let html = `<h1 class="page-title">${escapeHtml(mt.name)}</h1><div class="page-tag">${escapeHtml(mt.tag || "")}</div>`;

  /* --- PYQs box: shown first --- */
  const pyqBoxId = "pyqs-" + mt.id;
  html += boxOpen(pyqBoxId, "★ PYQs & aspects tested");
  html += `<div class="pyq-legend">Every question below maps to an aspect. ★ by recency: ★★★ 2023-25 · ★★ 2020-22 · ★ ≤2019.</div>`;
  html += `<table class="pyq-table">
      <tr><th>Year · Marks</th><th>Question</th></tr>
      ${(mt.pyqs || []).map((p) => `
        <tr>
          <td>${p.year} · ${p.marks}m <span class="pyq-star">${starsForYear(p.year)}</span></td>
          <td>${mdToHtml(p.question)} <span class="item-actions" style="opacity:.5;"><span onclick="removePyq('${p.id}')">del</span></span></td>
        </tr>`).join("")}
    </table>
    <div class="add-item-btn" onclick="addPyq('${mt.id}')">+ Add PYQ</div>`;

  const aspectsAsked = (mt.pyqs || []).filter((p) => p.aspect);
  if (aspectsAsked.length) {
    html += `<div class="asked-callout">
      <div class="asked-title">🎯 Aspects UPSC has asked here</div>
      <ol>${aspectsAsked.map((p) => `<li>${escapeHtml(p.aspect)} <span class="asked-year">${p.year}</span></li>`).join("")}</ol>
    </div>`;
  }
  html += boxClose;

  (mt.quotes || []).forEach((q) => { html += `<div class="quote-block">${mdToHtml(q.text)} <span class="item-actions" style="opacity:.5;"><span onclick="editQuote('${q.id}')">edit</span><span onclick="removeQuote('${q.id}')">del</span></span></div>`; });
  html += `<div class="add-item-btn" onclick="addQuote('${mt.id}')">+ Add quote</div>`;

  if (mt.summary && mt.summary.length) {
    html += `<ul class="item-list" style="margin-top:16px;">`;
    mt.summary.forEach((s) => {
      html += `<li><span class="item-body">→ ${mdToHtml(s.text)}</span> <span class="item-actions"><span onclick="editSummary('${s.id}')">edit</span><span onclick="removeSummary('${s.id}')">del</span></span></li>`;
    });
    html += `</ul>`;
  }
  html += `<div class="add-item-btn" onclick="addSummary('${mt.id}')">+ Add summary line</div>`;

  html += `<h2 class="plain-head">Key Thinkers &amp; Figures</h2>`;
  if (mt.people && mt.people.length) {
    html += `<div class="people-grid">`;
    mt.people.forEach((p) => {
      const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
      const photoHtml = p.photo
        ? `<img class="person-photo" src="${escapeHtml(p.photo)}" alt="${escapeHtml(p.name)}">`
        : `<div class="person-photo">${escapeHtml(initials)}</div>`;
      html += `<div class="person-row">
        ${photoHtml}
        <div style="flex:1;">
          <div class="row-between">
            <div class="person-name">${escapeHtml(p.name)}</div>
            <span class="item-actions" style="opacity:.5;">
              <span onclick="editPerson('${p.id}')">edit</span>
              <span onclick="setPersonPhoto('${p.id}')">photo</span>
              <span onclick="removePerson('${p.id}')">del</span>
            </span>
          </div>
          <div class="person-tag">${escapeHtml(p.tag || "")}</div>
          <ul class="person-bullets">
            ${(p.bullets || []).map((b) => `<li>${mdToHtml(b.text)} <span class="item-actions"><span onclick="editPersonBullet('${b.id}')">edit</span><span onclick="removePersonBullet('${b.id}')">del</span></span></li>`).join("")}
          </ul>
          <div class="add-item-btn" onclick="addPersonBullet('${p.id}')">+ Add point</div>
        </div>
      </div>`;
    });
    html += `</div><div class="add-item-btn" style="margin-top:10px;" onclick="addPerson('${mt.id}')">+ Add another thinker</div>`;
  } else {
    html += `<div class="people-grid-empty">No thinkers added yet for this microtheme.<div class="add-item-btn" style="margin-top:6px;" onclick="addPerson('${mt.id}')">+ Add a Key Thinker / Figure</div></div>`;
  }

  /* --- each content section gets the boxed / blue-header treatment --- */
  (mt.sections || []).forEach((sec) => {
    const starHtml = `<span class="star-toggle ${sec.starred ? "on" : ""}" onclick="event.stopPropagation();toggleStar('${sec.id}', ${!sec.starred})">${sec.starred ? "★" : "☆"}</span>`;
    const editHtml = `<span class="item-actions" style="opacity:.5;" onclick="event.stopPropagation();">
        <span onclick="renameSection('${sec.id}')">rename</span>
        <span onclick="removeSection('${sec.id}')">del</span>
      </span>`;
    html += boxOpen(sec.id, sec.title, editHtml, starHtml);
    html += `<ul class="item-list">${(sec.items || []).map((it) => renderItem(mt.id, it)).join("")}</ul>
      <div class="add-item-btn" onclick="addItem('${sec.id}')">+ Add bullet</div>`;
    html += boxClose;
  });
  html += `<div class="add-item-btn" style="margin-top:6px;" onclick="addSection('${mt.id}')">+ Add section</div>`;

  /* --- Aspects mastery tracker box --- */
  const aspBoxId = "aspects-" + mt.id;
  html += boxOpen(aspBoxId, "✓ Aspects — mastery tracker");
  html += (mt.aspects || []).map((a) => renderAspectCard(mt.id, a)).join("") || `<div class="weak-empty">No aspects yet — add one from the sidebar.</div>`;
  html += boxClose;

  html += renderAttachmentsBox(mt);
  html += renderTimeLogBox(mt);

  html += `<div style="margin-top:20px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
    ${ui.timer.status !== "stopped" && ui.timer.mtId === mt.id
      ? `<span class="btn ghost">⏱ Timer running for this microtheme — see the floating widget</span>`
      : `<span class="btn solid" onclick="startTimer('${mt.id}')">▶ Start timer</span>`}
    <span class="btn" onclick="logTime('${mt.id}')">✎ Log time manually</span>
    <span class="btn" onclick="exportMicrothemePDF('${mt.id}')">🖨 Export as PDF</span>
    <span class="btn danger" onclick="deleteMicrotheme('${mt.id}')">🗑 Delete microtheme</span>
  </div>`;

  c.innerHTML = html;
  document.body.classList.toggle("test-mode", ui.test);
  document.body.classList.toggle("skeleton-mode", ui.skeleton);
}

function splitTermAndRest(text) {
  // splits on the first " – " (en dash) or " - " so skeleton mode can show
  // just the key term/prompt and hide the explanation.
  const m = text.match(/^(.*?)\s[–-]\s(.*)$/);
  if (!m) return { term: text, rest: "" };
  return { term: m[1], rest: m[2] };
}

function renderItem(mtId, item) {
  const key = mtId + ":" + item.id;
  const revealed = ui.revealed[key];
  const clickable = ui.test || ui.skeleton;

  if (ui.skeleton && !revealed) {
    const { term, rest } = splitTermAndRest(item.text);
    return `<li class="${item.indent ? "indent" : ""}" onclick="revealItem('${mtId}','${item.id}')">
      <span class="item-body">${mdToHtml(term)}${rest ? ` <span class="skeleton-hint">– ?</span>` : ""}</span>
    </li>`;
  }

  return `<li class="${item.indent ? "indent" : ""} ${revealed ? "revealed" : ""}" ${clickable ? `onclick="revealItem('${mtId}','${item.id}')"` : ""}>
    <span class="item-body">${mdToHtml(item.text)}</span>
    <span class="item-actions"><span onclick="event.stopPropagation();editItem('${item.id}')">edit</span><span onclick="event.stopPropagation();removeItem('${item.id}')">del</span></span>
  </li>`;
}

function parseAspectContent(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter((l) => l.length);
  const blocks = [];
  let currentList = null;
  lines.forEach((line) => {
    if (line.startsWith("## ")) {
      currentList = null;
      blocks.push({ type: "heading", text: line.slice(3) });
    } else {
      const clean = line.replace(/^-\s*/, "");
      if (!currentList) { currentList = { type: "list", items: [] }; blocks.push(currentList); }
      currentList.items.push(clean);
    }
  });
  return blocks;
}

function renderAspectCard(mtId, a) {
  const expanded = ui.expandedAspects[a.id];
  const editing = ui.editingAspectContent === a.id;
  let html = `<div class="aspect-card ${a.memorised ? "" : "pending"} ${expanded ? "expanded" : ""}">
    <div class="aspect-card-head" onclick="toggleAspectExpand('${a.id}')">
      <div>${escapeHtml(a.label)}</div>
      <div class="aspect-meta">${a.memorised ? "✓ Memorised" : "Pending"} <span class="aspect-caret">${expanded ? "▾" : "▸"}</span></div>
    </div>`;

  if (expanded) {
    html += `<div class="aspect-detail">
      <div class="recall-row">
        <span class="recall-label">Recall quality?</span>
        <span class="btn small" onclick="setRecallQuality('${mtId}','${a.id}','hard')">Hard</span>
        <span class="btn small" onclick="setRecallQuality('${mtId}','${a.id}','good')">Good</span>
        <span class="btn small" onclick="setRecallQuality('${mtId}','${a.id}','easy')">Easy</span>
        ${a.lastRecall ? `<span class="recall-last">last: ${escapeHtml(a.lastRecall)}</span>` : ""}
      </div>`;

    if (editing) {
      html += `<textarea class="editor aspect-editor" id="aspect-content-${a.id}">${escapeHtml(a.content || "")}</textarea>
        <div class="hint">One point per line. Start a line with "## " for a sub-heading (e.g. "## How to make it effective").</div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <span class="btn small solid" onclick="saveAspectContent('${a.id}')">Save</span>
          <span class="btn small" onclick="cancelEditAspectContent()">Cancel</span>
        </div>`;
    } else {
      const blocks = parseAspectContent(a.content);
      if (blocks.length) {
        blocks.forEach((b) => {
          if (b.type === "heading") html += `<h3 class="sub-head">${escapeHtml(b.text)}</h3>`;
          else html += `<ol class="item-list">${b.items.map((it) => `<li>${mdToHtml(it)}</li>`).join("")}</ol>`;
        });
      } else {
        html += `<div class="weak-empty">No write-up yet for this aspect.</div>`;
      }
      html += `<div class="add-item-btn" onclick="startEditAspectContent('${a.id}')">${blocks.length ? "edit" : "+ write model answer"}</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

/* ============================= RENDER: DASHBOARD ============================= */
function renderDashboard() {
  const c = document.getElementById("content");

  let html = `<div class="dash-hero">
    <h1>Revision Dashboard</h1>
    <p>What to revise today, across every subject</p>
    <div class="search-row">
      <input type="text" id="search-input" class="search-input" placeholder="Search all your notes… (terms, PYQs, thinkers, aspects)"
        value="${escapeHtml(ui.searchQuery || "")}"
        onkeydown="if(event.key==='Enter'){runSearch(this.value);}">
      <span class="btn small solid" onclick="runSearch(document.getElementById('search-input').value)">🔍 Search</span>
      ${ui.searchQuery ? `<span class="btn small" onclick="clearSearch()">✕ Clear</span>` : ""}
    </div>
  </div>`;

  if (ui.searchQuery && ui.searchQuery.trim()) {
    html += renderSearchResults(ui.searchQuery.trim());
    c.innerHTML = html;
    return;
  }

  const all = allMicrothemes();
  const due = all.filter(({ mt }) => isDue(mt)).length;
  const started = all.filter(({ mt }) => (mt.revisions && mt.revisions.length > 0) || (mt.aspects || []).some((a) => a.memorised)).length;
  let totalAsp = 0, doneAsp = 0;
  all.forEach(({ mt }) => { totalAsp += (mt.aspects || []).length; doneAsp += (mt.aspects || []).filter((a) => a.memorised).length; });
  const merged = mergedTimeLog();
  const totalMinutes = Object.values(merged).reduce((a, b) => a + b, 0);

  html += `<div class="cards-row">
    <div class="dcard"><div class="num">${due}</div><div class="lab">MICROTHEMES DUE</div></div>
    <div class="dcard"><div class="num">${computeStreak()}</div><div class="lab">DAY STREAK 🔥</div></div>
    <div class="dcard"><div class="num">${overallMastery()}%</div><div class="lab">OVERALL MASTERY</div><div class="bar"><div style="width:${overallMastery()}%"></div></div></div>
    <div class="dcard"><div class="num">${started} / ${all.length}</div><div class="lab">MICROTHEMES STARTED</div></div>
    <div class="dcard"><div class="num">${doneAsp} / ${totalAsp}</div><div class="lab">ASPECTS MASTERED</div></div>
    <div class="dcard"><div class="num">${(totalMinutes / 60).toFixed(1)}h</div><div class="lab">TOTAL HOURS STUDIED</div></div>
  </div>`;
  html += `<div class="cal-wrap">
    <h2 class="plain-head" style="margin-top:0;">📊 Hours studied</h2>
    <div class="cal-months">${renderMonthCalendar(-1, merged)}${renderMonthCalendar(0, merged)}</div>
    <div class="cal-legend">Less ░ ▒ ▓ █ More — deeper shade = more minutes studied, today is outlined</div>
  </div>`;
  const shown = ui.dashFilterDue ? all.filter(({ mt }) => isDue(mt)) : all;
  html += `<div class="row-between" style="margin-bottom:2px;">
    <h2 class="plain-head" style="margin:20px 0 0;">📚 ${ui.dashFilterDue ? "Due today" : "All microthemes"}</h2>
    <span class="btn small ${ui.dashFilterDue ? "solid" : ""}" onclick="toggleDueFilter()">${ui.dashFilterDue ? "✕ Clear filter" : "📌 Show only due"}</span>
  </div>
  <table class="mt-table">
    <tr><th>Subject</th><th>Microtheme</th><th>Mastery</th><th>Revisions</th><th>Next due</th></tr>
    ${shown.map(({ mt, subject }) => `
      <tr style="cursor:pointer;" onclick="openMicrotheme('${mt.id}')">
        <td>${escapeHtml(subject.name)}</td>
        <td>${escapeHtml(mt.name)}</td>
        <td>${mtMastery(mt)}%</td>
        <td>${(mt.revisions || []).length}</td>
        <td>${isDue(mt) ? `<span class="due-tag">Due now</span>` : nextDueDate(mt)}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="text-align:center; color:var(--muted); font-family:-apple-system,sans-serif;">Nothing due today 🎉</td></tr>`}
  </table>`;
  c.innerHTML = html;

  const input = document.getElementById("search-input");
  if (input && ui.focusSearch) { input.focus(); ui.focusSearch = false; }
}

function stripMdForSnippet(text) {
  return (text || "")
    .replace(/\{\{(\w+):(.+?)\}\}/g, "$2")
    .replace(/==|__|\^\^/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");
}
function highlightHit(text, query) {
  const safe = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${q})`, "ig"), '<mark class="search-hit">$1</mark>');
}

function searchNotes(query) {
  const q = query.toLowerCase();
  const results = [];
  allMicrothemes().forEach(({ mt, subject }) => {
    const hits = [];
    const check = (label, text) => {
      if (text && text.toLowerCase().includes(q)) hits.push({ label, text: stripMdForSnippet(text) });
    };
    check("Microtheme name", mt.name);
    (mt.quotes || []).forEach((x) => check("Quote", x.text));
    (mt.summary || []).forEach((x) => check("Summary", x.text));
    (mt.sections || []).forEach((sec) => {
      (sec.items || []).forEach((it) => check(sec.title, it.text));
    });
    (mt.pyqs || []).forEach((p) => { check(`PYQ ${p.year}`, p.question); check("PYQ aspect", p.aspect); });
    (mt.people || []).forEach((p) => {
      check("Thinker", p.name);
      (p.bullets || []).forEach((b) => check(p.name, b.text));
    });
    (mt.aspects || []).forEach((a) => { check("Aspect", a.label); check(`Aspect: ${a.label}`, a.content); });
    if (hits.length) results.push({ mt, subject, hits: hits.slice(0, 5) });
  });
  return results;
}

function renderSearchResults(query) {
  const results = searchNotes(query);
  if (!results.length) {
    return `<div class="weak-empty" style="margin-top:20px;">No matches for "${escapeHtml(query)}".</div>`;
  }
  let html = `<div class="search-summary">${results.length} microtheme${results.length === 1 ? "" : "s"} match "${escapeHtml(query)}"</div>`;
  results.forEach(({ mt, subject, hits }) => {
    html += `<div class="search-result" onclick="openMicrotheme('${mt.id}')">
      <div class="search-result-head"><span class="sb-crumb">${escapeHtml(subject.name)}</span> · <b>${escapeHtml(mt.name)}</b></div>
      ${hits.map((h) => `<div class="search-hit-row"><span class="search-hit-label">${escapeHtml(h.label)}:</span> ${highlightHit(h.text, query)}</div>`).join("")}
    </div>`;
  });
  return html;
}

function runSearch(value) {
  ui.searchQuery = value;
  ui.focusSearch = true;
  renderDashboard();
}
function clearSearch() {
  ui.searchQuery = "";
  renderDashboard();
}
function toggleDueFilter() {
  ui.dashFilterDue = !ui.dashFilterDue;
  renderDashboard();
}

function renderMonthCalendar(offset, merged) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let startIdx = (first.getDay() + 6) % 7;
  let cells = [];
  for (let i = 0; i < startIdx; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  let rows = "";
  for (let r = 0; r < cells.length; r += 7) {
    rows += "<tr>" + cells.slice(r, r + 7).map((d) => {
      if (!d) return "<td></td>";
      const key = new Date(y, m, d).toISOString().slice(0, 10);
      const min = merged[key] || 0;
      const lvl = min <= 0 ? 0 : min < 20 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4;
      const isToday = key === todayStr();
      return `<td><div class="cal-cell lvl${lvl}" style="${isToday ? "outline:2px solid var(--navy);" : ""}" title="${key}: ${min}m">
        <span class="d">${d}</span>${min ? `<span class="m">${min}m</span>` : ""}
      </div></td>`;
    }).join("") + "</tr>";
  }
  return `<div class="cal-month"><table><caption>${monthName}</caption><tr><th>M</th><th>T</th><th>W</th><th>T</th><th>F</th><th>S</th><th>S</th></tr>${rows}</table></div>`;
}

/* ============================= RENDER ROOT ============================= */
function render() {
  document.getElementById("sidebar").classList.toggle("collapsed", ui.sidebarHidden);
  document.body.classList.toggle("sidebar-hidden", ui.sidebarHidden);
  renderSidebar();
  renderTopbar();
  if (ui.currentView === "dashboard") renderDashboard();
  else if (ui.currentView === "planner") renderPlanner();
  else renderMicrotheme();
}

/* ============================= ACTIONS ============================= */
function openMicrotheme(id) { ui.currentMicrotheme = id; ui.currentView = "microtheme"; ui.revealed = {}; saveUiPrefs(); render(); }
function openDashboard() { ui.currentView = "dashboard"; saveUiPrefs(); render(); }

function markRevised(mtId) { mutate("POST", `/api/microthemes/${mtId}/revise`); }
function toggleAspect(aspId, checked) { mutate("PATCH", `/api/aspects/${aspId}`, { memorised: checked }); }
function addAspect(mtId) {
  const label = prompt("New aspect label:");
  if (!label) return;
  mutate("POST", "/api/aspects", { microthemeId: mtId, label });
}
function toggleStar(secId, next) { mutate("PATCH", `/api/sections/${secId}`, { starred: next }); }
function renameSection(secId) {
  const cur = findSectionById(secId);
  const t = prompt("Section title:", cur ? cur.title : "");
  if (t) mutate("PATCH", `/api/sections/${secId}`, { title: t });
}
function removeSection(secId) {
  if (confirm("Delete this whole section?")) mutate("DELETE", `/api/sections/${secId}`);
}
function addSection(mtId) {
  const t = prompt("New section title:");
  if (t) mutate("POST", "/api/sections", { microthemeId: mtId, title: t });
}
const SYNTAX_HINT = "==yellow highlight==, ^^blue highlight^^, __underline__, **bold**, *italic*, {{color:text}} e.g. {{red:urgent}} (colors: red, green, blue, navy, orange, purple, grey, black)";

function addItem(secId) {
  const t = prompt(`New bullet (${SYNTAX_HINT}). Start with '- ' for a sub-bullet:`);
  if (!t) return;
  const indent = t.trim().startsWith("-") ? 1 : 0;
  const clean = indent ? t.trim().replace(/^-+\s*/, "") : t;
  mutate("POST", "/api/items", { sectionId: secId, text: clean, indent });
}
function editItem(itemId) {
  const cur = findItemById(itemId);
  const t = prompt(`Edit bullet (${SYNTAX_HINT}):`, cur ? cur.text : "");
  if (t !== null && t !== "") mutate("PATCH", `/api/items/${itemId}`, { text: t });
}
function removeItem(itemId) { mutate("DELETE", `/api/items/${itemId}`); }

function addQuote(mtId) {
  const t = prompt(`New quote (${SYNTAX_HINT}):`);
  if (t) mutate("POST", "/api/quotes", { microthemeId: mtId, text: t });
}
function editQuote(id) {
  const cur = findQuoteById(id);
  const t = prompt(`Edit quote (${SYNTAX_HINT}):`, cur ? cur.text : "");
  if (t !== null && t !== "") mutate("PATCH", `/api/quotes/${id}`, { text: t });
}
function removeQuote(id) { mutate("DELETE", `/api/quotes/${id}`); }
function addSummary(mtId) {
  const t = prompt(`New summary line (${SYNTAX_HINT}):`);
  if (t) mutate("POST", "/api/summary", { microthemeId: mtId, text: t });
}
function editSummary(id) {
  const cur = findSummaryById(id);
  const t = prompt(`Edit summary line (${SYNTAX_HINT}):`, cur ? cur.text : "");
  if (t !== null && t !== "") mutate("PATCH", `/api/summary/${id}`, { text: t });
}
function removeSummary(id) { mutate("DELETE", `/api/summary/${id}`); }

function addPyq(mtId) {
  const year = prompt("Year:");
  if (!year) return;
  const marks = prompt("Marks:", "10");
  const question = prompt(`Question text (wrap the key phrase in ^^like this^^ to highlight it in blue):`);
  const aspect = prompt("Aspect tag (short label, shown in the 'Aspects UPSC has asked here' list below):");
  mutate("POST", "/api/pyqs", { microthemeId: mtId, year, marks, question, aspect });
}
function removePyq(id) { mutate("DELETE", `/api/pyqs/${id}`); }

function logTime(mtId) {
  const min = prompt("Minutes studied just now:", "20");
  if (!min || isNaN(min)) return;
  mutate("POST", `/api/microthemes/${mtId}/timelog`, { minutes: Number(min) });
}

/* ============================= LIVE STUDY TIMER ============================= */
function formatHMS(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
}
function currentSegmentElapsed() {
  return ui.timer.segmentStart ? Date.now() - ui.timer.segmentStart : 0;
}
function liveStudyMs() { return ui.timer.studyMs + (ui.timer.status === "running" ? currentSegmentElapsed() : 0); }
function liveBreakMs() { return ui.timer.breakMs + (ui.timer.status === "paused" ? currentSegmentElapsed() : 0); }

function startTimer(mtId) {
  if (ui.timer.status !== "stopped") {
    alert(`A timer is already running for "${ui.timer.mtName}". Click "End & Log" on it first.`);
    return;
  }
  const found = findMicrotheme(mtId);
  ui.timer = { mtId, mtName: found ? found.mt.name : "", status: "running", studyMs: 0, breakMs: 0, segmentStart: Date.now() };
  saveTimerState();
  renderTimerWidget();
  render();
}
function pauseTimer() {
  if (ui.timer.status !== "running") return;
  ui.timer.studyMs += currentSegmentElapsed();
  ui.timer.status = "paused";
  ui.timer.segmentStart = Date.now();
  saveTimerState();
  renderTimerWidget();
}
function resumeTimer() {
  if (ui.timer.status !== "paused") return;
  ui.timer.breakMs += currentSegmentElapsed();
  ui.timer.status = "running";
  ui.timer.segmentStart = Date.now();
  saveTimerState();
  renderTimerWidget();
}
function endTimer() {
  if (ui.timer.status === "stopped") return;
  if (ui.timer.status === "running") ui.timer.studyMs += currentSegmentElapsed();
  else if (ui.timer.status === "paused") ui.timer.breakMs += currentSegmentElapsed();

  const studyMinutes = Math.round(ui.timer.studyMs / 60000);
  const breakMinutes = Math.round(ui.timer.breakMs / 60000);
  const mtId = ui.timer.mtId;
  const mtName = ui.timer.mtName;

  ui.timer = { mtId: null, mtName: "", status: "stopped", studyMs: 0, breakMs: 0, segmentStart: null };
  saveTimerState();
  renderTimerWidget();

  if (studyMinutes > 0) {
    mutate("POST", `/api/microthemes/${mtId}/timelog`, { minutes: studyMinutes }).then(() => {
      alert(`Logged ${studyMinutes} min of study time for "${mtName}"${breakMinutes ? ` (${breakMinutes} min break not logged).` : "."}`);
    });
  } else {
    render();
    alert("Timer ended — 0 study minutes recorded (nothing logged).");
  }
}
function renderTimerWidget() {
  const el = document.getElementById("timer-widget");
  if (!el) return;
  if (ui.timer.status === "stopped") { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "flex";
  el.innerHTML = `
    <div class="timer-info">
      <div class="timer-mt">${escapeHtml(ui.timer.mtName)}</div>
      <div class="timer-clocks">
        <span class="timer-study">⏱ ${formatHMS(liveStudyMs())}</span>
        ${ui.timer.status === "paused" ? `<span class="timer-break">☕ ${formatHMS(liveBreakMs())}</span>` : ""}
      </div>
    </div>
    <div class="timer-actions">
      ${ui.timer.status === "running"
        ? `<span class="btn small" onclick="pauseTimer()">⏸ Pause</span>`
        : `<span class="btn small" onclick="resumeTimer()">▶ Resume</span>`}
      <span class="btn small solid" onclick="endTimer()">■ End &amp; Log</span>
    </div>`;
}
setInterval(() => { if (ui.timer.status !== "stopped") renderTimerWidget(); }, 1000);

function deleteMicrotheme(mtId) {
  if (!confirm("Delete this notes page permanently?\n\nIf it is a subtopic in your Micro Plan, it is removed there too.")) return;
  api("DELETE", `/api/microthemes/${mtId}`).then(async () => {
    await refreshTree();
    const rem = allMicrothemes();
    if (rem.length) { ui.currentMicrotheme = rem[0].mt.id; ui.currentView = "microtheme"; }
    else ui.currentView = "dashboard";
    saveUiPrefs();
    render();
  });
}
function addSubject() {
  const t = prompt("Subject name (e.g. Polity, Economy, Geography):");
  if (t) mutate("POST", "/api/subjects", { name: t });
}
function addMicrotheme(subjectId, topicId) {
  const t = prompt("Notes page name:");
  if (!t) return;
  const tag = prompt("Exam tag (e.g. UPSC GS Mains · GS3):", "");
  api("POST", "/api/microthemes", { subjectId, topicId: topicId || null, name: t, tag }).then(async ({ id }) => {
    await refreshTree();
    ui.currentMicrotheme = id;
    ui.currentView = "microtheme";
    saveUiPrefs();
    render();
  });
}

function addPerson(mtId) {
  const name = prompt("Thinker / figure's name:");
  if (!name) return;
  const tag = prompt("Short tag (e.g. 'Right to food'):", "");
  const photo = prompt("Photo URL (optional — paste an image link, or leave blank for initials):", "");
  mutate("POST", "/api/people", { microthemeId: mtId, name, tag, photo });
}
function editPerson(personId) {
  const cur = findPersonById(personId);
  const name = prompt("Name:", cur ? cur.name : "");
  if (!name) return;
  const tag = prompt("Tag:", cur ? cur.tag : "");
  mutate("PATCH", `/api/people/${personId}`, { name, tag });
}
function setPersonPhoto(personId) {
  const cur = findPersonById(personId);
  const photo = prompt("Photo URL (paste an image link, e.g. from Wikipedia):", cur ? cur.photo : "");
  if (photo !== null) mutate("PATCH", `/api/people/${personId}`, { photo });
}
function removePerson(personId) {
  if (confirm("Remove this thinker/figure?")) mutate("DELETE", `/api/people/${personId}`);
}
function addPersonBullet(personId) {
  const t = prompt(`New point about them (${SYNTAX_HINT}):`);
  if (t) mutate("POST", "/api/people-bullets", { personId, text: t });
}
function editPersonBullet(bulletId) {
  const cur = findPersonBulletById(bulletId);
  const t = prompt("Edit point:", cur ? cur.text : "");
  if (t !== null && t !== "") mutate("PATCH", `/api/people-bullets/${bulletId}`, { text: t });
}
function removePersonBullet(bulletId) { mutate("DELETE", `/api/people-bullets/${bulletId}`); }

function toggleAspectExpand(aspectId) {
  ui.expandedAspects[aspectId] = !ui.expandedAspects[aspectId];
  if (!ui.expandedAspects[aspectId]) ui.editingAspectContent = null;
  renderMicrotheme();
}
function startEditAspectContent(aspectId) { ui.editingAspectContent = aspectId; renderMicrotheme(); }
function cancelEditAspectContent() { ui.editingAspectContent = null; renderMicrotheme(); }
function saveAspectContent(aspectId) {
  const el = document.getElementById("aspect-content-" + aspectId);
  const content = el ? el.value : "";
  ui.editingAspectContent = null;
  mutate("PATCH", `/api/aspects/${aspectId}`, { content });
}
function setRecallQuality(mtId, aspectId, quality) {
  const memorised = quality === "good" || quality === "easy";
  const label = quality.charAt(0).toUpperCase() + quality.slice(1) + " · " + todayStr();
  api("PATCH", `/api/aspects/${aspectId}`, { memorised, lastRecall: label }).then(() => {
    api("POST", `/api/microthemes/${mtId}/revise`).then(async () => {
      await refreshTree();
      render();
    });
  });
}

/* --- collapse toggles --- */
function findTopic(topicId) {
  for (const s of tree) for (const t of s.topics || []) if (t.id === topicId) return { topic: t, subj: s };
  return null;
}
function addTopic(subjectId) {
  const t = prompt("Topic name (a folder for notes pages, e.g. Internal Security):");
  if (t && t.trim()) {
    ui.collapsedSubjects[subjectId] = false;
    saveUiPrefs();
    mutate("POST", "/api/subject-topics", { subjectId, name: t.trim() });
  }
}
function renameTopic(topicId) {
  const f = findTopic(topicId);
  const t = prompt("Topic name:", f ? f.topic.name : "");
  if (t && t.trim()) mutate("PATCH", `/api/subject-topics/${topicId}`, { name: t.trim() });
}
function deleteTopic(topicId) {
  const f = findTopic(topicId);
  if (!f) return;
  const n = f.subj.microthemes.filter((m) => m.topicId === topicId).length;
  if (confirm(`Delete the topic "${f.topic.name}"?\n\n${n ? `Its ${n} notes page${n === 1 ? "" : "s"} are kept and move up under ${f.subj.name}.` : "It has no pages."}\nIf it is a subject in your Micro Plan, that subject stops syncing with the notes.`)) {
    mutate("DELETE", `/api/subject-topics/${topicId}`);
  }
}
function toggleTopicCollapse(topicId) {
  ui.collapsedTopics[topicId] = !isTopicCollapsed(topicId);
  saveUiPrefs();
  renderSidebar();
}
function toggleSubjectCollapse(subjId) {
  ui.collapsedSubjects[subjId] = !isSubjectCollapsed(subjId);
  saveUiPrefs();
  renderSidebar();
}
function toggleSectionCollapse(secId) {
  ui.collapsedSections[secId] = !ui.collapsedSections[secId];
  saveUiPrefs();
  const box = document.getElementById("box-" + secId);
  if (box) box.classList.toggle("collapsed", ui.collapsedSections[secId]);
}
function expandAllSections(mtId) {
  const { mt } = findMicrotheme(mtId);
  (mt.sections || []).forEach((s) => { ui.collapsedSections[s.id] = false; });
  ui.collapsedSections["pyqs-" + mtId] = false;
  ui.collapsedSections["aspects-" + mtId] = false;
  saveUiPrefs();
  renderMicrotheme();
}
function collapseAllSections(mtId) {
  const { mt } = findMicrotheme(mtId);
  (mt.sections || []).forEach((s) => { ui.collapsedSections[s.id] = true; });
  ui.collapsedSections["pyqs-" + mtId] = true;
  ui.collapsedSections["aspects-" + mtId] = true;
  saveUiPrefs();
  renderMicrotheme();
}
function toggleSidebar() { ui.sidebarHidden = !ui.sidebarHidden; saveUiPrefs(); render(); }

function toggleTest() { ui.test = !ui.test; if (ui.test) ui.skeleton = false; ui.revealed = {}; render(); }
function toggleSkeleton() { ui.skeleton = !ui.skeleton; if (ui.skeleton) ui.test = false; ui.revealed = {}; render(); }
function revealItem(mtId, itemId) { ui.revealed[mtId + ":" + itemId] = true; renderMicrotheme(); }
function toggleTheme() {
  ui.darkMode = !ui.darkMode;
  document.documentElement.setAttribute("data-theme", ui.darkMode ? "dark" : "light");
  saveUiPrefs();
  renderTopbar();
}

/* ============================= LOOKUP HELPERS (for prefilled edits) ============================= */
function findSectionById(secId) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const s of mt.sections || []) if (s.id === secId) return s;
  return null;
}
function findItemById(itemId) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const s of mt.sections || []) for (const it of s.items || []) if (it.id === itemId) return it;
  return null;
}
function findSummaryById(id) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const s of mt.summary || []) if (s.id === id) return s;
  return null;
}
function findQuoteById(id) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const q of mt.quotes || []) if (q.id === id) return q;
  return null;
}
function findPersonById(id) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const p of mt.people || []) if (p.id === id) return p;
  return null;
}
function findPersonBulletById(id) {
  for (const subj of tree) for (const mt of subj.microthemes) for (const p of mt.people || []) for (const b of p.bullets || []) if (b.id === id) return b;
  return null;
}

/* ============================= INIT ============================= */
(async function init() {
  document.documentElement.setAttribute("data-theme", ui.darkMode ? "dark" : "light");
  await refreshTree();
  await loadDashboardNotes();
  await loadAuthStatus();
  if (ui.currentView === "planner") { try { await loadPlanner(); } catch (e) { /* page shows loading */ } }
  if (!getCurrentMT() && allMicrothemes().length) {
    ui.currentMicrotheme = allMicrothemes()[0].mt.id;
  }
  render();
  renderTimerWidget();
  renderChatWidget();
})();
