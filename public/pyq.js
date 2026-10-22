/* PYQ Bank — subject-wise. Polity first: UPSC CSE + CDS + CAPF questions merged under common subtopics. */
(function () {
  "use strict";
  const LS = "pyq2_ui";
  const $root = document.getElementById("pq-root");
  const $modal = document.getElementById("pq-modal");
  const $toast = document.getElementById("pq-toast");
  const L4 = ["a", "b", "c", "d"];
  const EXAMS = ["CSE", "CDS", "CAPF"];
  const EXAM_NAME = { CSE: "UPSC CSE", CDS: "CDS", CAPF: "CAPF" };

  const S = { view: "questions", qf: "", an: { exam: "", from: "" }, qs: [], subject: "Polity", exams: [], year: "", status: "all", search: "", t: "", sort: "new", showNotes: true, limit: 30, reveal: {}, noteOpen: {}, modal: null };
  let QBY = {}, SUG = [];

  try {
    const sv = JSON.parse(localStorage.getItem(LS) || "{}");
    ["view", "subject", "exams", "year", "status", "t", "sort", "showNotes"].forEach((k) => { if (sv[k] !== undefined) S[k] = sv[k]; });
  } catch (e) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(LS, JSON.stringify({ view: S.view, subject: S.subject, exams: S.exams, year: S.year, status: S.status, t: S.t, sort: S.sort, showNotes: S.showNotes })); } catch (e) { /* ignore */ } };
  try { document.documentElement.setAttribute("data-theme", localStorage.getItem("uv_dark") === "1" ? "dark" : "light"); } catch (e) { /* ignore */ }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let toastTimer = null;
  function toast(msg, bad) {
    $toast.textContent = msg; $toast.className = bad ? "bad" : ""; $toast.style.display = "block";
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $toast.style.display = "none"; }, bad ? 5000 : 2400);
  }
  async function api(method, url, body) {
    let res;
    try { res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { toast("Cannot reach the NotesVerse server. Is it still running?", true); throw e; }
    if (res.status === 401) { location.href = "/login.html"; throw new Error("login"); }
    let data = null; try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) { toast((data && data.error) || "Something went wrong (" + res.status + ")", true); throw new Error("http " + res.status); }
    return data;
  }

  /* ---------- data helpers ---------- */
  const sessionTxt = (q) => (q.se ? " (" + q.se + ")" : "");
  const label = (q) => (EXAM_NAME[q.x] || q.x) + " " + q.y + sessionTxt(q);
  const isRight = (q) => !!(q.my && q.c && q.my === q.c);
  const hasNote = (q) => !!(q.note && q.note.trim());
  const split = (txt) => String(txt || "").split(/[\n,;|]+/).map((x) => x.trim().replace(/[.\s]+$/, "")).filter(Boolean);
  const norm = (x) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const keysOf = (txt) => Array.from(new Set(split(txt).map(norm)));
  const hasTech = (q) => !!(q.tq && q.tq.trim());
  function computeSug() {
    const m = {}; S.qs.forEach((q) => split(q.tq).forEach((x) => { const k = norm(x); (m[k] = m[k] || { n: 0, label: x }).n++; }));
    SUG = Object.values(m).sort((a, b) => b.n - a.n).slice(0, 12).map((x) => x.label);
  }
  function index() { QBY = {}; S.qs.forEach((q) => { QBY[q.id] = q; }); computeSug(); }
  const subjects = () => Array.from(new Set(S.qs.map((q) => q.s))).sort();
  const subQs = () => S.qs.filter((q) => q.s === S.subject);
  function passes(q, skipTopic) {
    if (q.s !== S.subject) return false;
    if (S.exams.length && !S.exams.includes(q.x)) return false;
    if (S.year && String(q.y) !== String(S.year)) return false;
    if (!skipTopic && S.t && q.t !== S.t) return false;
    if (S.status === "unattempted" && q.my) return false;
    if (S.status === "attempted" && !q.my) return false;
    if (S.status === "right" && !isRight(q)) return false;
    if (S.status === "wrong" && !(q.my && q.c && q.my !== q.c)) return false;
    if (S.status === "flagged" && !q.f) return false;
    if (S.status === "notes" && !hasNote(q)) return false;
    if (S.status === "nokey" && q.c) return false;
    if (S.status === "tech" && !hasTech(q)) return false;
    if (S.qf && !keysOf(q.tq).includes(S.qf)) return false;
    if (S.search) {
      const hay = (q.q + " " + L4.map((k) => q.o[k]).join(" ") + " " + (q.note || "") + " " + (q.tq || "") + " " + (q.e || "")).toLowerCase();
      if (!S.search.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  function list() {
    const a = S.qs.filter((q) => passes(q));
    const dir = S.sort === "old" ? 1 : -1;
    a.sort((p, q) => dir * (p.y - q.y) || p.x.localeCompare(q.x) || (p.se || "").localeCompare(q.se || "") || p.n - q.n);
    return a;
  }

  /* ---------- rendering ---------- */
  function header() {
    return `<div class="pq-top">
      <span class="pq-brand">📝 PYQ Bank</span>
      <div class="pq-tabs"><button class="pq-tab ${S.view === "questions" ? "on" : ""}" data-act="view" data-v="questions">❓ Questions</button><button class="pq-tab ${S.view === "analysis" ? "on" : ""}" data-act="view" data-v="analysis">📊 Analysis</button></div>
      <button class="pq-btn small" data-act="theme">🌓 Theme</button>
      <a class="pq-link" href="/">← NotesVerse</a>
    </div>`;
  }
  function sidebar() {
    const base = S.qs.filter((q) => passes(q, true));
    const cnt = {}; base.forEach((q) => { cnt[q.t || "(no subtopic)"] = (cnt[q.t || "(no subtopic)"] || 0) + 1; });
    const names = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
    const years = Array.from(new Set(subQs().map((q) => q.y))).sort((a, b) => b - a);
    const exCnt = (x) => subQs().filter((q) => q.x === x).length;
    const exams = Array.from(new Set(subQs().map((q) => q.x))).sort((a, b) => EXAMS.indexOf(a) - EXAMS.indexOf(b));
    const stat = [["all", "All questions"], ["unattempted", "Not attempted"], ["attempted", "Attempted"], ["right", "Got right"], ["wrong", "Got wrong"], ["flagged", "⚑ Marked for revision"], ["notes", "📝 Have my notes"], ["tech", "🧩 Technique / trap written"], ["nokey", "Answer key missing"]];
    return `<div class="pq-side">
      <h4>Subject</h4>
      <select class="pq-select" data-f="subject">${subjects().map((s) => `<option ${s === S.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <h4>Exam</h4>
      <div class="pq-chips"><span class="pq-chip ${!S.exams.length ? "on" : ""}" data-act="exam" data-x="">All exams</span>${exams.map((x) => `<span class="pq-chip ${S.exams.includes(x) ? "on" : ""}" data-act="exam" data-x="${x}">${EXAM_NAME[x] || x} · ${exCnt(x)}</span>`).join("")}</div>
      <h4>Year</h4>
      <select class="pq-select" data-f="year"><option value="">All years</option>${years.map((y) => `<option ${String(y) === String(S.year) ? "selected" : ""}>${y}</option>`).join("")}</select>
      <h4>Show</h4>
      <select class="pq-select" data-f="status">${stat.map(([k, n]) => `<option value="${k}" ${S.status === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <h4>Search</h4>
      <input class="pq-input" id="pq-search" data-f="search" placeholder="Search questions & my notes…" value="${esc(S.search)}">
      <h4>Subtopic</h4>
      <div class="pq-tree">
        <div class="pq-node ${!S.t ? "on" : ""}" data-act="topic" data-t=""><span class="nm">All of ${esc(S.subject)}</span><span class="ct">${base.length}</span></div>
        ${names.map((n) => `<div class="pq-node ${S.t === n ? "on" : ""}" data-act="topic" data-t="${esc(n)}"><span class="nm">${esc(n)}</span><span class="ct">${cnt[n]}</span></div>`).join("")}
      </div>
    </div>`;
  }
  function toolbarHtml(items) {
    const byEx = {}; items.forEach((q) => { byEx[q.x] = (byEx[q.x] || 0) + 1; });
    const exTxt = Object.keys(byEx).sort((a, b) => EXAMS.indexOf(a) - EXAMS.indexOf(b)).map((x) => `${EXAM_NAME[x] || x} ${byEx[x]}`).join(" · ");
    const att = items.filter((q) => q.my), right = att.filter(isRight).length, graded = att.filter((q) => q.c).length;
    const nn = items.filter(hasNote).length;
    return `<div class="pq-toolbar">
        <span class="pq-theme-name">${esc(S.t || "All of " + S.subject)}</span>
        <span class="pq-count">${items.length} question${items.length === 1 ? "" : "s"}</span>
        ${exTxt ? `<span class="pq-mini">${exTxt}</span>` : ""}
        ${S.qf ? `<span class="pq-chip on" data-act="clear-qf" title="Click to clear">🧩 ${esc(S.qf)} ✕</span>` : ""}
      </div>
      <div class="pq-toolbar">
        <span class="pq-mini">${nn} with my notes · attempted ${att.length}${graded ? ` · ✔ ${right} · ✘ ${graded - right} · ${Math.round((100 * right) / graded)}%` : ""}</span>
        <span class="sp" style="flex:1"></span>
        <select class="pq-select" style="width:auto" data-f="sort"><option value="new" ${S.sort === "new" ? "selected" : ""}>Newest first</option><option value="old" ${S.sort === "old" ? "selected" : ""}>Oldest first</option></select>
        <button class="pq-btn small ${S.showNotes ? "solid" : ""}" data-act="notes-toggle" title="Hide notes to test yourself; show them to revise">📝 Notes: ${S.showNotes ? "shown" : "hidden"}</button>
        <button class="pq-btn small" data-act="key-open">🔑 Answer key</button>
        <button class="pq-btn small" data-act="add-open">＋ Add question</button>
        <a class="pq-btn small" href="/api/pyq/export" title="Download everything you wrote as one backup file">💾 Backup</a>
        <button class="pq-btn small" data-act="restore-open" title="Put back a backup file">⤴ Restore</button>
      </div>`;
  }
  function stemHtml(text) {
    return (text || "").split("\n").map((l) => `<div class="${/^\s*(\d+\s*[.)]|\([ivx]+\)|[A-D]\s*[.)]|Statement)/i.test(l) ? "li" : ""}">${esc(l)}</div>`).join("");
  }
  function cardHtml(q) {
    const attempted = !!q.my, shown = attempted || !!S.reveal[q.id];
    const badge = attempted && q.c ? (isRight(q) ? '<span class="pq-badge right">✔ Right</span>' : '<span class="pq-badge wrong">✘ Wrong</span>') : "";
    const opts = L4.map((k) => {
      let cls = "";
      if (shown && q.c) { if (k === q.c) cls = "correct"; else if (q.my === k) cls = "wrong"; }
      return `<button class="pq-opt ${cls} ${shown ? "locked" : ""}" data-act="pick" data-id="${q.id}" data-o="${k}"><span class="l">${k.toUpperCase()}</span><span>${esc(q.o[k])}</span></button>`;
    }).join("");
    let after = "";
    if (shown) {
      let msg;
      if (!q.c) {
        msg = `<div class="pq-note">No answer key for this question yet. Set the correct answer: ${L4.map((k) => `<button class="pq-btn small" data-act="setkey" data-id="${q.id}" data-o="${k}">${k.toUpperCase()}</button>`).join(" ")}${q.e ? `<br><span class="pq-mini">${esc(q.e)}</span>` : ""}</div>`;
      } else if (attempted) {
        msg = `<div class="pq-mini">You chose <b>${q.my.toUpperCase()}</b> · correct answer <b>${q.c.toUpperCase()}</b>${q.ac > 1 ? " · attempted " + q.ac + "×, right " + q.cc + "×" : ""} &nbsp; <button class="pq-btn small" data-act="retry" data-id="${q.id}" title="Practise again; this attempt stays in your stats">↺ Try again</button> <button class="pq-btn small" data-act="unattempt" data-id="${q.id}" title="Clicked by mistake? Remove this attempt completely, including from the stats">✕ Unattempt</button></div>`;
      } else {
        msg = `<div class="pq-mini">Correct answer: <b>${q.c.toUpperCase()}</b> (not counted as an attempt) &nbsp; <button class="pq-btn small" data-act="hide" data-id="${q.id}">Hide answer</button></div>`;
      }
      if (attempted && !q.c) msg += `<p><button class="pq-btn small" data-act="unattempt" data-id="${q.id}">✕ Unattempt</button></p>`;
      after = `<div class="pq-after">${msg}
        ${q.e && q.c ? `<div class="pq-lab">Explanation</div><div class="pq-expl">${esc(q.e)}</div>` : ""}
      </div>`;
    }
    let notes = "";
    if (S.showNotes || S.noteOpen[q.id]) {
      if (hasNote(q) || hasTech(q) || S.noteOpen[q.id]) {
        const rows = (t, m) => Math.min(8, Math.max(m, Math.ceil((t || "").length / 90) + 1));
        const sug = SUG.filter((x) => !keysOf(q.tq).includes(norm(x))).slice(0, 6);
        notes = `<div class="pq-notebox"><div class="pq-lab">📝 Concept note <span class="pq-saved" id="ns-${q.id}-note"></span></div>
          <textarea class="pq-area" rows="${rows(q.note, 2)}" data-f="note" data-id="${q.id}" placeholder="The concept behind this question: why this is the answer, what to link it to…">${esc(q.note)}</textarea>
          <div class="pq-lab">🧩 Technique / trap <span class="pq-saved" id="ns-${q.id}-tq"></span></div>
          <textarea class="pq-area" rows="${rows(q.tq, 1)}" data-f="tq" data-id="${q.id}" placeholder="Your words: the technique that worked, or the trap you fell for / spotted. e.g. interchange of statements. Several? separate with commas. Leave empty for pure-concept questions.">${esc(q.tq)}</textarea>
          ${sug.length ? `<div class="pq-chips" style="margin-top:5px"><span class="pq-mini">Used before:</span>${sug.map((x) => `<span class="pq-chip" data-act="sug" data-id="${q.id}" data-v="${esc(x)}">${esc(x)}</span>`).join("")}</div>` : ""}</div>`;
      } else {
        notes = `<p style="margin:10px 0 0;"><button class="pq-btn small" data-act="note-open" data-id="${q.id}">📝 Add note / technique / trap</button></p>`;
      }
    }
    return `<div class="pq-card" id="q-${q.id}">
      <div class="pq-card-head">
        <span class="pq-ex ex-${esc(q.x)}">${esc(EXAM_NAME[q.x] || q.x)}</span>
        <span class="id">${q.y}${esc(sessionTxt(q))} · Q${q.n}</span>
        <span class="pq-chip tag" title="Click to change the subtopic" data-act="retag" data-id="${q.id}">${esc(q.t || "No subtopic")} ✎</span>${badge}
        <span class="sp"></span>
        <button class="pq-icon ${q.f ? "on" : ""}" data-act="flag" data-id="${q.id}" title="Mark for revision">${q.f ? "⚑" : "⚐"}</button>
        <button class="pq-icon" data-act="edit" data-id="${q.id}" title="Edit this question">✏</button>
      </div>
      <div class="pq-body-in">
        <div class="pq-stem">${stemHtml(q.q)}</div>
        ${opts}
        ${shown ? "" : `<p style="margin:6px 0 0;"><button class="pq-btn small" data-act="reveal" data-id="${q.id}">Show answer without attempting</button></p>`}
        ${notes}
        ${after}
      </div></div>`;
  }
  function render() {
    if (S.view === "analysis") { $root.innerHTML = header() + `<div class="pq-page">${analysisHtml()}</div>`; return; }
    const items = list();
    $root.innerHTML = header() + `<div class="pq-page"><div class="pq-split">${sidebar()}<div id="pq-main">${toolbarHtml(items)}<div id="pq-list">${listHtml(items)}</div></div></div></div>`;
  }
  function listHtml(items) {
    if (!items.length) return `<div class="pq-note">No questions match these filters.</div>`;
    const shown = items.slice(0, S.limit);
    return shown.map(cardHtml).join("") + (items.length > shown.length ? `<p style="text-align:center"><button class="pq-btn" data-act="more">Show ${Math.min(30, items.length - shown.length)} more (${items.length - shown.length} left)</button></p>` : "");
  }
  function renderMain() {
    if (S.view !== "questions") return render();
    const items = list();
    document.getElementById("pq-main").innerHTML = toolbarHtml(items) + `<div id="pq-list">${listHtml(items)}</div>`;
    const side = document.querySelector(".pq-side"); if (side) { const st = side.scrollTop; side.outerHTML = sidebar(); const n = document.querySelector(".pq-side"); if (n) n.scrollTop = st; }
  }
  function redrawCard(id) {
    const q = QBY[id], el = document.getElementById("q-" + id);
    if (q && el) el.outerHTML = cardHtml(q);
  }
  function upd(q, r) { Object.assign(q, r); }


  /* ---------- analysis ---------- */
  function analysisHtml() {
    const exFilter = S.an.exam, from = parseInt(S.an.from, 10) || 0;
    const A = subQs().filter((q) => (!exFilter || q.x === exFilter) && q.y >= from);
    const bar = (pct, col) => `<div class="pq-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;${col ? "background:" + col : ""}"></i></div>`;
    const pc = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    const att = A.filter((q) => q.my), graded = att.filter((q) => q.c), right = graded.filter(isRight).length;
    const topics = Array.from(new Set(A.map((q) => q.t || "No subtopic")));
    const yrsAll = Array.from(new Set(A.map((q) => q.y))).sort((a, b) => a - b);
    const yrs = yrsAll.slice(-16);
    const cseYears = Array.from(new Set(A.filter((q) => q.x === "CSE").map((q) => q.y))).sort((a, b) => a - b);
    const last5 = cseYears.slice(-5);

    const exBtn = (v, n) => `<button class="pq-chip ${exFilter === v ? "on" : ""}" data-act="an-exam" data-v="${v}">${n}</button>`;
    const frBtn = (v, n) => `<button class="pq-chip ${S.an.from === v ? "on" : ""}" data-act="an-from" data-v="${v}">${n}</button>`;
    let h = `<h1 class="pq-h1">Analysis — ${esc(S.subject)}</h1>
      <div class="pq-sub">Trends from ${A.length} question${A.length === 1 ? "" : "s"}. Techniques and traps are read from the 🧩 box you fill on each question. CDS and CAPF only cover 2020–2025, so pick <b>UPSC CSE</b> below to see the real UPSC trend.</div>
      <div class="pq-toolbar"><span class="pq-mini">Exam:</span><div class="pq-chips">${exBtn("", "All")}${exBtn("CSE", "UPSC CSE")}${exBtn("CDS", "CDS")}${exBtn("CAPF", "CAPF")}</div>
        <span class="pq-mini" style="margin-left:14px">Years:</span><div class="pq-chips">${frBtn("", "All")}${frBtn("2011", "2011 →")}${frBtn("2016", "2016 →")}${frBtn("2020", "2020 →")}</div></div>
      <div class="pq-cards">
        <div class="pq-stat"><b>${A.length}</b><span>questions</span></div>
        <div class="pq-stat"><b>${att.length}</b><span>attempted by you</span></div>
        <div class="pq-stat"><b>${graded.length ? pc(right, graded.length) + "%" : "–"}</b><span>your accuracy</span></div>
        <div class="pq-stat"><b>${A.filter(hasNote).length}</b><span>concept notes</span></div>
        <div class="pq-stat"><b>${A.filter(hasTech).length}</b><span>with technique / trap</span></div></div>`;

    /* 1. subtopic overview */
    const rows = topics.map((t) => {
      const qs = A.filter((q) => (q.t || "No subtopic") === t), g = qs.filter((q) => q.my && q.c), r = g.filter(isRight).length;
      return { t, n: qs.length, cse: qs.filter((q) => q.x === "CSE").length, cds: qs.filter((q) => q.x === "CDS").length, capf: qs.filter((q) => q.x === "CAPF").length,
        l5: qs.filter((q) => q.x === "CSE" && last5.includes(q.y)).length, att: qs.filter((q) => q.my).length, g: g.length, r };
    }).sort((a, b) => b.n - a.n);
    const maxN = rows.length ? rows[0].n : 1;
    h += `<div class="pq-sec">1 · Which subtopics are asked most</div>
      <div class="pq-mini">"Last 5 CSE" counts UPSC CSE questions in the five latest years here (${last5.length ? last5.join(", ") : "none"}). Click a subtopic to open its questions.</div>
      <div class="pq-scroll"><table class="pq-table"><tr><th>Subtopic</th><th>Total</th><th></th><th>CSE</th><th>CDS</th><th>CAPF</th><th>Last 5 CSE</th><th>Attempted</th><th>My accuracy</th></tr>
      ${rows.map((r) => `<tr><td><a href="#" data-act="go-topic" data-t="${esc(r.t)}" data-x="${esc(exFilter)}" style="color:var(--navy)">${esc(r.t)}</a></td><td><b>${r.n}</b></td><td style="min-width:90px">${bar(pc(r.n, maxN))}</td><td>${r.cse}</td><td>${r.cds}</td><td>${r.capf}</td><td>${r.l5}</td><td>${r.att}</td><td>${r.g ? `<span class="${pc(r.r, r.g) >= 60 ? "pq-ok" : "pq-no"}">${pc(r.r, r.g)}%</span> <span class="pq-mini">(${r.r}/${r.g})</span>` : "–"}</td></tr>`).join("")}</table></div>`;

    /* 2. year-wise heatmap */
    const cell = {}; A.forEach((q) => { const k = (q.t || "No subtopic") + "|" + q.y; cell[k] = (cell[k] || 0) + 1; });
    const maxC = Math.max(1, ...Object.values(cell));
    h += `<div class="pq-sec">2 · Year-wise pattern (subtopic × year)</div>
      <div class="pq-mini">Darker = more questions that year${exFilter ? "" : " (all exams together)"}. Click a cell to see those questions.</div>
      <div class="pq-scroll"><table class="pq-table pq-heat"><tr><th>Subtopic</th>${yrs.map((y) => `<th style="text-align:center">${String(y).slice(2)}</th>`).join("")}</tr>
      ${rows.map((r) => `<tr><td>${esc(r.t)}</td>${yrs.map((y) => { const n = cell[r.t + "|" + y] || 0; return `<td class="c" ${n ? `data-act="go-topic" data-t="${esc(r.t)}" data-y="${y}" data-x="${esc(exFilter)}"` : ""} style="${n ? `background:rgba(70,90,200,${(0.12 + 0.6 * n / maxC).toFixed(2)})` : ""}">${n || ""}</td>`; }).join("")}</tr>`).join("")}</table></div>`;

    /* 3. answer option distribution */
    const keyed = A.filter((q) => q.c), dist = {}; L4.forEach((k) => { dist[k] = 0; }); keyed.forEach((q) => { dist[q.c]++; });
    h += `<div class="pq-sec">3 · Which option is the correct answer (${keyed.length} questions with a key)</div>
      <div class="pq-cards">${L4.map((k) => `<div class="pq-stat"><b>${k.toUpperCase()}</b><span>${dist[k]} (${pc(dist[k], keyed.length)}%)</span>${bar(pc(dist[k], keyed.length))}</div>`).join("")}</div>`;

    /* 4/5. techniques and traps */
    function agg(field) {
      const m = {};
      A.forEach((q) => split(q[field]).forEach((lab) => {
        const k = norm(lab); const o = (m[k] = m[k] || { k, label: lab, qs: new Set(), g: 0, r: 0, subs: {} });
        if (o.qs.has(q.id)) return; o.qs.add(q.id);
        const sub = q.t || "No subtopic"; o.subs[sub] = (o.subs[sub] || 0) + 1;
        if (q.my && q.c) { o.g++; if (isRight(q)) o.r++; }
      }));
      return Object.values(m).map((o) => Object.assign(o, { n: o.qs.size })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    }
    function table(list, act, emptyMsg) {
      if (!list.length) return `<div class="pq-note">${emptyMsg}</div>`;
      const tot = list.reduce((a, o) => a + o.n, 0);
      return `<div class="pq-scroll"><table class="pq-table"><tr><th>Written as</th><th>Questions</th><th></th><th>Share</th><th>Right when attempted</th><th>Mostly in</th></tr>
        ${list.map((o) => { const top = Object.entries(o.subs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${esc(t)} (${n})`).join(", ");
          return `<tr><td><a href="#" data-act="${act}" data-v="${esc(o.k)}" data-t="${esc(S.t && false ? S.t : "")}" style="color:var(--navy)">${esc(o.label)}</a></td><td><b>${o.n}</b></td><td style="min-width:80px">${bar(pc(o.n, list[0].n))}</td><td>${pc(o.n, tot)}%</td><td>${o.g ? `${pc(o.r, o.g)}% <span class="pq-mini">(${o.r}/${o.g})</span>` : "–"}</td><td class="pq-mini">${top}</td></tr>`; }).join("")}</table></div>`;
    }
    const techs = agg("tq");
    h += `<div class="pq-sec">4 · Techniques and traps (from your notes)</div>
      ${table(techs, "go-tech", "Nothing yet. Write a technique or trap in the 🧩 box on a question (e.g. <i>interchange of statements</i>) and it will appear here. Use the same words each time so they count together.")}`;
    if (techs.length) {
      const bySub = {}; techs.forEach((o) => Object.entries(o.subs).forEach(([t, n]) => { (bySub[t] = bySub[t] || []).push([o.label, n]); }));
      h += `<div class="pq-lab" style="margin-top:14px">By subtopic</div><div class="pq-scroll"><table class="pq-table"><tr><th>Subtopic</th><th>What you wrote most</th></tr>
        ${Object.keys(bySub).sort().map((t) => `<tr><td>${esc(t)}</td><td>${bySub[t].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, n]) => `${esc(l)} <b>×${n}</b>`).join(" · ")}</td></tr>`).join("")}</table></div>`;
    }

    /* 6. weak spots */
    const weak = rows.filter((r) => r.g >= 3).sort((a, b) => pc(a.r, a.g) - pc(b.r, b.g)).slice(0, 6);
    h += `<div class="pq-sec">5 · Where you are weakest</div>` + (weak.length
      ? `<div class="pq-scroll"><table class="pq-table"><tr><th>Subtopic</th><th>Your accuracy</th><th>Right / attempted</th></tr>${weak.map((r) => `<tr><td><a href="#" data-act="go-topic" data-t="${esc(r.t)}" style="color:var(--navy)">${esc(r.t)}</a></td><td class="${pc(r.r, r.g) >= 60 ? "pq-ok" : "pq-no"}">${pc(r.r, r.g)}%</td><td>${r.r} / ${r.g}</td></tr>`).join("")}</table></div>`
      : `<div class="pq-note">Attempt at least 3 questions in a subtopic (with answers set) and your weakest subtopics will show here.</div>`);
    return h;
  }

  /* ---------- modals ---------- */
  function topicsOf(subject) { return Array.from(new Set(S.qs.filter((q) => q.s === subject && q.t).map((q) => q.t))).sort(); }
  function closeModal() { S.modal = null; $modal.innerHTML = ""; }
  function modalEdit(id) {
    const q = id ? QBY[id] : null;
    const isNew = !q;
    const v = q || { s: S.subject, x: "CSE", y: new Date().getFullYear(), se: "", n: "", t: S.t || "", q: "", o: { a: "", b: "", c: "", d: "" }, c: "", e: "" };
    S.modal = { id };
    const tps = topicsOf(v.s);
    $modal.innerHTML = `<div class="pq-backdrop"><div class="pq-dialog">
      <h3>${isNew ? "Add a question" : "Edit question"}</h3>
      ${isNew ? `<div class="pq-opts" style="grid-template-columns:repeat(5,1fr)">
        <div><div class="pq-lab">Subject</div><input class="pq-input" id="m-s" value="${esc(v.s)}"></div>
        <div><div class="pq-lab">Exam</div><select class="pq-select" id="m-x">${EXAMS.map((x) => `<option>${x}</option>`).join("")}</select></div>
        <div><div class="pq-lab">Year</div><input class="pq-input" id="m-y" value="${v.y}"></div>
        <div><div class="pq-lab">Session (CDS: I / II)</div><input class="pq-input" id="m-se" value=""></div>
        <div><div class="pq-lab">Question no.</div><input class="pq-input" id="m-n" value=""></div></div>` : `<div class="pq-mini">${esc(label(v))} · Q${v.n}</div>`}
      <div class="pq-lab">Question text (statements on separate lines)</div>
      <textarea class="pq-area" id="m-q" rows="8">${esc(v.q)}</textarea>
      <div class="pq-opts">${L4.map((k) => `<div><div class="pq-lab">Option ${k.toUpperCase()}</div><textarea class="pq-area" id="m-o${k}" rows="2">${esc(v.o[k])}</textarea></div>`).join("")}</div>
      <div class="pq-opts">
        <div><div class="pq-lab">Correct answer</div><select class="pq-select" id="m-c"><option value="">— not set —</option>${L4.map((k) => `<option value="${k}" ${v.c === k ? "selected" : ""}>${k.toUpperCase()}</option>`).join("")}</select></div>
        <div><div class="pq-lab">Subtopic</div><input class="pq-input" id="m-t" list="m-tl" value="${esc(v.t)}"><datalist id="m-tl">${tps.map((t) => `<option value="${esc(t)}">`).join("")}</datalist></div>
      </div>
      <div class="pq-lab">Explanation (optional)</div>
      <textarea class="pq-area" id="m-e" rows="3">${esc(v.e)}</textarea>
      <p style="display:flex; gap:8px; margin-top:14px;">
        ${isNew ? "" : `<button class="pq-btn danger" data-act="del-q">Delete question</button>`}
        <span style="flex:1"></span><button class="pq-btn" data-act="modal-close">Cancel</button><button class="pq-btn solid" data-act="edit-save">Save</button></p>
    </div></div>`;
  }
  async function saveEdit() {
    const val = (i) => document.getElementById(i).value;
    const body = { q: val("m-q"), o: { a: val("m-oa"), b: val("m-ob"), c: val("m-oc"), d: val("m-od") }, c: val("m-c"), e: val("m-e"), t: val("m-t").trim() };
    if (!body.q.trim()) return toast("Question text can't be empty", true);
    if (S.modal.id) {
      const r = await api("PATCH", "/api/pyq/questions/" + S.modal.id, body);
      upd(QBY[S.modal.id], r); closeModal(); renderMain(); toast("Saved ✓");
    } else {
      const r = await api("POST", "/api/pyq/questions", Object.assign({ s: val("m-s").trim(), x: val("m-x"), y: val("m-y"), se: val("m-se"), n: val("m-n") }, body));
      S.qs.push(r); index(); closeModal(); renderMain(); toast("Question added ✓");
    }
  }
  function modalRetag(id) {
    const q = QBY[id]; S.modal = { id };
    const tps = topicsOf(q.s);
    $modal.innerHTML = `<div class="pq-backdrop"><div class="pq-dialog narrow">
      <h3>Subtopic for ${esc(label(q))} · Q${q.n}</h3>
      <div class="pq-lab">Pick an existing subtopic or type a new one</div>
      <input class="pq-input" id="m-t" list="m-tl" value="${esc(q.t)}"><datalist id="m-tl">${tps.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
      <div class="pq-chips" style="margin-top:10px">${tps.map((t) => `<span class="pq-chip" data-act="retag-pick" data-t="${esc(t)}">${esc(t)}</span>`).join("")}</div>
      <p style="text-align:right; margin-top:14px;"><button class="pq-btn" data-act="modal-close">Cancel</button> <button class="pq-btn solid" data-act="retag-save">Save</button></p>
    </div></div>`;
  }
  function modalKey() {
    // papers = unique (exam, year, session) in this subject
    const m = {};
    subQs().forEach((q) => { const k = [q.x, q.y, q.se].join("|"); (m[k] = m[k] || { x: q.x, y: q.y, se: q.se, miss: 0, n: 0 }); m[k].n++; if (!q.c) m[k].miss++; });
    const papers = Object.values(m).sort((a, b) => b.miss - a.miss || EXAMS.indexOf(a.x) - EXAMS.indexOf(b.x) || b.y - a.y);
    $modal.innerHTML = `<div class="pq-backdrop"><div class="pq-dialog narrow">
      <h3>🔑 Answer key for a paper</h3>
      <div class="pq-mini">Papers with missing answers are listed first. Paste pairs like <code>2 a, 3 c, 7 d</code> or one per line (<code>2) a</code>). Question numbers are the paper's own numbers (Q2, Q3…).</div>
      <div class="pq-lab">Paper</div>
      <select class="pq-select" id="k-p">${papers.map((p, i) => `<option value="${i}">${EXAM_NAME[p.x] || p.x} ${p.y}${p.se ? " Session " + p.se : ""} — ${p.n} questions, ${p.miss} without answer</option>`).join("")}</select>
      <div class="pq-lab">Answers</div>
      <textarea class="pq-area" id="k-t" rows="7" placeholder="2 a&#10;3 c&#10;7 d"></textarea>
      <p style="text-align:right; margin-top:14px;"><button class="pq-btn" data-act="modal-close">Cancel</button> <button class="pq-btn solid" data-act="key-save">Save answers</button></p>
    </div></div>`;
    S.modal = { papers };
  }
  async function saveKey() {
    const p = S.modal.papers[parseInt(document.getElementById("k-p").value, 10)];
    const txt = document.getElementById("k-t").value, key = {};
    let m; const re = /(\d{1,3})\s*[).:\-–=]?\s*\(?([a-dA-D])\)?(?![a-z])/g;
    while ((m = re.exec(txt))) key[m[1]] = m[2].toLowerCase();
    if (!Object.keys(key).length) return toast("No answers found — use the form  2 a, 3 c …", true);
    const r = await api("PUT", "/api/pyq/key", { subject: S.subject, exam: p.x, year: p.y, session: p.se, key });
    S.qs.forEach((q) => { if (q.s === S.subject && q.x === p.x && q.y === p.y && q.se === p.se && key[q.n]) q.c = key[q.n]; });
    closeModal(); renderMain(); toast(r.updated + " answers saved ✓");
  }

  /* ---------- actions ---------- */
  async function attempt(id, letter) {
    const q = QBY[id]; if (!q || q.my) return;
    upd(q, await api("POST", "/api/pyq/questions/" + id + "/attempt", { answer: letter }));
    redrawCard(id);
  }
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) return;
    if (el.tagName === "A") ev.preventDefault();
    const act = el.dataset.act, id = el.dataset.id, q = id ? QBY[id] : null;
    try {
      switch (act) {
        case "theme": { const dark = document.documentElement.getAttribute("data-theme") !== "dark"; document.documentElement.setAttribute("data-theme", dark ? "dark" : "light"); try { localStorage.setItem("uv_dark", dark ? "1" : "0"); } catch (e) { /* ignore */ } break; }
        case "exam": { const x = el.dataset.x; S.exams = !x ? [] : S.exams.includes(x) ? S.exams.filter((e) => e !== x) : S.exams.concat(x); S.limit = 30; savePrefs(); renderMain(); break; }
        case "topic": S.t = el.dataset.t; S.limit = 30; savePrefs(); renderMain(); window.scrollTo({ top: 0 }); break;
        case "more": S.limit += 30; renderMain(); break;
        case "view": S.view = el.dataset.v; savePrefs(); render(); window.scrollTo({ top: 0 }); break;
        case "clear-qf": S.qf = ""; renderMain(); break;
        case "sug": { const cur = (q.tq || "").trim(); const v = cur ? cur.replace(/[,;\s]+$/, "") + ", " + el.dataset.v : el.dataset.v; upd(q, await api("PATCH", "/api/pyq/questions/" + id, { tq: v })); computeSug(); redrawCard(id); break; }
        case "an-exam": S.an.exam = el.dataset.v; render(); break;
        case "an-from": S.an.from = el.dataset.v; render(); break;
        case "go-topic": S.view = "questions"; S.t = el.dataset.t || ""; S.exams = el.dataset.x ? [el.dataset.x] : []; S.year = el.dataset.y || ""; S.status = "all"; S.qf = ""; S.search = ""; S.limit = 30; savePrefs(); render(); window.scrollTo({ top: 0 }); break;
        case "go-tech": S.view = "questions"; S.qf = el.dataset.v; S.t = el.dataset.t || ""; S.exams = []; S.year = ""; S.status = "all"; S.search = ""; S.limit = 30; savePrefs(); render(); window.scrollTo({ top: 0 }); break;
        case "notes-toggle": S.showNotes = !S.showNotes; savePrefs(); renderMain(); break;
        case "pick": await attempt(id, el.dataset.o); break;
        case "reveal": S.reveal[id] = true; redrawCard(id); break;
        case "hide": delete S.reveal[id]; redrawCard(id); break;
        case "retry": upd(q, await api("DELETE", "/api/pyq/questions/" + id + "/attempt")); delete S.reveal[id]; redrawCard(id); break;
        case "unattempt": upd(q, await api("DELETE", "/api/pyq/questions/" + id + "/attempt?undo=1")); delete S.reveal[id]; redrawCard(id); break;
        case "flag": upd(q, await api("PATCH", "/api/pyq/questions/" + id, { f: !q.f })); redrawCard(id); break;
        case "note-open": S.noteOpen[id] = true; redrawCard(id); { const ta = document.querySelector("#q-" + id + ' textarea[data-f="note"]'); if (ta) ta.focus(); } break;
        case "setkey": upd(q, await api("PATCH", "/api/pyq/questions/" + id, { c: el.dataset.o })); redrawCard(id); break;
        case "edit": modalEdit(id); break;
        case "add-open": modalEdit(null); break;
        case "edit-save": await saveEdit(); break;
        case "del-q": if (confirm("Delete this question permanently?")) { await api("DELETE", "/api/pyq/questions/" + S.modal.id); S.qs = S.qs.filter((x) => x.id !== S.modal.id); index(); closeModal(); renderMain(); toast("Deleted"); } break;
        case "retag": modalRetag(id); break;
        case "retag-pick": document.getElementById("m-t").value = el.dataset.t; break;
        case "retag-save": { const t = document.getElementById("m-t").value.trim(); const r = await api("PATCH", "/api/pyq/questions/" + S.modal.id, { t }); upd(QBY[S.modal.id], r); closeModal(); renderMain(); toast("Subtopic updated ✓"); break; }
        case "key-open": modalKey(); break;
        case "key-save": await saveKey(); break;
        case "restore-open": $modal.innerHTML = `<div class="pq-backdrop"><div class="pq-dialog narrow"><h3>Restore from a backup file</h3><div class="pq-mini">Choose a <code>pyq-backup-….json</code> file. It puts back your notes, techniques, attempts, answers and subtopics and adds any missing questions. It never deletes anything.</div><p><input type="file" id="rs-file" accept=".json,application/json"></p><p style="text-align:right"><button class="pq-btn" data-act="modal-close">Cancel</button> <button class="pq-btn solid" data-act="restore-go">Restore</button></p></div></div>`; break;
        case "restore-go": {
          const f = document.getElementById("rs-file").files[0]; if (!f) { toast("Choose the backup file first", true); break; }
          let data; try { data = JSON.parse(await f.text()); } catch (e2) { toast("That file is not a valid backup", true); break; }
          const r = await api("POST", "/api/pyq/restore", data);
          const d = await api("GET", "/api/pyq/bank"); S.qs = d.questions; index(); closeModal(); render(); toast("Restored: " + r.updated + " updated, " + r.added + " added ✓"); break;
        }
        case "modal-close": closeModal(); break;
        default: break;
      }
    } catch (e) { /* api() already showed the message */ }
  });
  const timers = {};
  document.addEventListener("input", (ev) => {
    const el = ev.target, f = el.dataset && el.dataset.f; if (!f) return;
    if (f === "note" || f === "tq") {
      const id = el.dataset.id, tk = id + f; clearTimeout(timers[tk]);
      timers[tk] = setTimeout(async () => {
        try { const r = await api("PATCH", "/api/pyq/questions/" + id, { [f]: el.value }); QBY[id][f] = r[f]; if (f === "tq") computeSug(); const s = document.getElementById("ns-" + id + "-" + f); if (s) { s.textContent = "saved ✓"; setTimeout(() => { s.textContent = ""; }, 1500); } } catch (e) { /* toast shown */ }
      }, 700);
    } else if (f === "search") {
      clearTimeout(timers.search);
      timers.search = setTimeout(() => { S.search = el.value; S.limit = 30; const list2 = list(); document.getElementById("pq-main").innerHTML = toolbarHtml(list2) + `<div id="pq-list">${listHtml(list2)}</div>`; }, 250);
    }
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target, f = el.dataset && el.dataset.f; if (!f || f === "note" || f === "tq" || f === "search") return;
    if (f === "subject") { S.subject = el.value; S.t = ""; S.exams = []; S.year = ""; }
    if (f === "year") S.year = el.value;
    if (f === "status") S.status = el.value;
    if (f === "sort") S.sort = el.value;
    S.limit = 30; savePrefs(); renderMain();
  });
  window.addEventListener("beforeunload", () => { Object.keys(timers).forEach((k) => clearTimeout(timers[k])); });

  (async function boot() {
    try {
      const d = await api("GET", "/api/pyq/bank");
      S.qs = d.questions; index();
      if (!subjects().includes(S.subject)) S.subject = subjects()[0] || "Polity";
      render();
    } catch (e) { $root.innerHTML = '<div class="pq-loading">Could not load the PYQ Bank. Is the server running?</div>'; }
  })();
})();
