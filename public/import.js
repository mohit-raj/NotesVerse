/* "Import notes file" dialog: pick one or more consolidated notes files (.json), preview, import. */
(function () {
  let files = [];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function close() { const m = document.getElementById("nv-imp"); if (m) m.remove(); }
  async function post(notes, dryRun) {
    const r = await fetch("/api/import-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes, dryRun }) });
    const t = await r.text(); if (!r.ok) throw new Error(t); return JSON.parse(t);
  }
  window.nvImport = function () {
    close(); files = [];
    const m = document.createElement("div"); m.id = "nv-imp";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;";
    m.innerHTML = `<div style="background:var(--bg,#fff);color:var(--ink,#111);border-radius:12px;padding:22px;width:min(640px,94vw);max-height:86vh;overflow:auto;font-family:-apple-system,sans-serif">
      <h3 style="margin:0 0 6px">⬆ Import notes file</h3>
      <div style="font-size:13px;opacity:.75;margin-bottom:12px">Choose the notes file(s) Claude made for you (.json). Each file knows its own place (Subject › Topic › Page). Existing notes are never deleted; a backup is saved first.</div>
      <input type="file" id="nv-imp-f" accept=".json,application/json" multiple>
      <div id="nv-imp-out" style="margin:14px 0;font-size:13px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="nv-imp-x">Cancel</button><button class="btn solid" id="nv-imp-go" disabled>Import</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector("#nv-imp-x").onclick = close;
    const out = m.querySelector("#nv-imp-out"), go = m.querySelector("#nv-imp-go");
    m.querySelector("#nv-imp-f").onchange = async (e) => {
      files = []; go.disabled = true; out.textContent = "Reading…";
      try {
        for (const f of e.target.files) {
          const j = JSON.parse(await f.text());
          (Array.isArray(j) ? j : j.notes && Array.isArray(j.notes) ? j.notes : [j]).forEach((x) => files.push(x));
        }
        const pv = await post(files, true);
        out.innerHTML = pv.items.map((i) => `<div style="border:1px solid #ccc;border-radius:8px;padding:8px 10px;margin-bottom:8px"><b>${esc(i.path)}</b><br>${esc(i.action)}<br><span style="opacity:.75">${i.counts.summary} summary · ${i.counts.quotes} quotes · ${i.counts.people} thinkers · ${i.counts.sections} sections · ${i.counts.points} points</span></div>`).join("");
        go.disabled = false;
      } catch (err) { out.innerHTML = `<span style="color:#b00">That file could not be used: ${esc(err.message)}</span>`; }
    };
    go.onclick = async () => {
      go.disabled = true; go.textContent = "Importing…";
      try {
        const r = await post(files, false);
        out.innerHTML = `<b>Done.</b> ${r.done.length} page(s) imported. Reloading…`;
        if (r.done.length === 1) { try { localStorage.setItem("uv_mt", r.done[0].pageId); localStorage.setItem("uv_view", "microtheme"); } catch (e) {} }
        setTimeout(() => location.reload(), 900);
      } catch (err) { out.innerHTML = `<span style="color:#b00">Import failed: ${esc(err.message)}</span>`; go.disabled = false; go.textContent = "Import"; }
    };
  };
})();

/* ===== Bullet editor: type or paste many lines; each line becomes a bullet. Tab = sub-bullet. ===== */
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MARK = /^(?:[-*•–▸●○◦▪]\s+|\d+[.)]\s+)/;
  function parse(text, base, noSec) {
    const blocks = [{ title: "", starred: 0, items: [] }];
    String(text || "").replace(/\r/g, "").split("\n").forEach((raw) => {
      if (!raw.trim()) return;
      const lead = raw.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length;
      let t = raw.trim();
      const h = t.match(/^#{1,4}\s+(.*)$/) || t.match(/^\*\*(.+?)\*\*:?$/);
      if (h && !MARK.test(raw.trim()) && !noSec) {
        let title = h[1].trim(), starred = 0;
        if (/^[★☆]/.test(title)) { starred = 1; title = title.replace(/^[★☆]\s*/, ""); }
        blocks.push({ title, starred, items: [] }); return;
      }
      if (noSec && h) t = h[1].trim();
      t = t.replace(MARK, "").trim();
      if (!t) return;
      const lvl = Math.min(2, (base || 0) + Math.floor(lead / 2));
      blocks[blocks.length - 1].items.push([t, lvl]);
    });
    return blocks.filter((b, i) => b.items.length || (i > 0 && b.title));
  }
  /* Auto-structure without AI: question lines become headings, long paragraphs are cut into sentences,
     "Label: details" becomes a label with its details underneath, ";" splits, very long sentences are cut at a comma. */
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function cutLong(sn) {
    if (sn.length <= 230) return [sn];
    const mid = sn.length / 2; let best = -1;
    for (let i = 0; i < sn.length - 1; i++) if (sn[i] === "," && sn[i + 1] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return best > 60 && best < sn.length - 60 ? [sn.slice(0, best), sn.slice(best + 2).replace(/^./, (c) => c.toUpperCase())] : [sn];
  }
  function smartText(text, knownTitle, noSec) {
    const out = []; let pad = "";
    text.replace(/\r/g, "").split("\n").forEach((line) => {
      if (!line.trim()) return;
      const rawLead = (line.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "  ");
      let body = line.trim().replace(MARK, "").replace(/\s+([?:;,.])/g, "$1").trim();
      if (!body) return;
      const isHead = /^#{1,4}\s/.test(body) || /^\*\*.+\*\*:?$/.test(body);
      if (noSec) {
        // adding inside an existing section: a question/heading line is a top-level bullet, its lines go under it
        if (isHead || (/\?$/.test(body) && body.length < 120 && !rawLead)) { out.push(body.replace(/^#{1,4}\s+/, "").replace(/^\*\*(.+?)\*\*:?$/, "$1")); pad = "  "; return; }
      } else if (isHead) { out.push(body); return; }
      const lead = rawLead || pad;
      if (!noSec && /\?$/.test(body) && body.length < 120 && !lead) { if (knownTitle && norm(body) === norm(knownTitle)) return; out.push("## " + body); return; }
      if (knownTitle && !lead && norm(body) === norm(knownTitle)) return;
      const sents = body.length > 110 || /\?\s+[A-Z]/.test(body) ? body.split(/(?<=[.;?])\s+(?=[A-Z“"(0-9])/) : [body];
      sents.forEach((sn) => {
        sn = sn.replace(/[.;]$/, "").trim(); if (!sn) return;
        const lead = rawLead || pad;
        if (/\?$/.test(sn) && sn.length < 120 && !rawLead) {
          if (noSec) { out.push(sn); pad = "  "; return; }
          if (!(knownTitle && norm(sn) === norm(knownTitle))) out.push("## " + sn); return;
        }
        const lab = sn.match(/^([^:]{3,70}?):\s+(.{30,})$/);
        if (lab && lab[1].split(/\s+/).length <= 4 && !/[,(]/.test(lab[1])) {
          out.push(lead + lab[1]);
          lab[2].split(/;\s+/).forEach((r) => cutLong(r.trim()).forEach((x) => out.push(lead + "  " + x.replace(/^./, (c) => c.toUpperCase()))));
        } else sn.split(/;\s+/).forEach((r) => cutLong(r.trim()).forEach((x) => out.push(lead + x)));
      });
    });
    return out.join("\n");
  }
  function close() { const m = document.getElementById("nv-ed"); if (m) m.remove(); }
  function findSection(itemId) {
    for (const s of (window.tree || tree)) for (const m of s.microthemes) for (const sec of m.sections || []) if ((sec.items || []).some((i) => i.id === itemId)) return sec.id;
    return null;
  }
  window.nvEditor = function (o) {
    close();
    const edit = o.mode === "edit", sect = o.mode === "section";
    let base = o.base || 0;
    if (edit && !o.theme) { try { const it = findItemById(o.itemId); base = it ? Math.min(2, it.indent || 0) : 0; } catch (e) {} }
    let knownTitle = "";
    try { const sid = o.secId || (edit ? findSection(o.itemId) : null); for (const sj of tree) for (const mm of sj.microthemes) for (const sc of mm.sections || []) if (sc.id === sid) knownTitle = sc.title; } catch (e) {}
    const m = document.createElement("div"); m.id = "nv-ed";
    m.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
    m.innerHTML = `<div style="background:var(--bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:12px;padding:20px;width:min(720px,95vw);max-height:90vh;overflow:auto;font-family:-apple-system,sans-serif">
      <h3 style="margin:0 0 6px">${sect ? "New section" : edit ? "Edit bullet" : "Add bullets"}</h3>
      ${sect ? `<input id="nv-ed-t" placeholder="Section heading, e.g. What is a National Security Doctrine?" style="width:100%;padding:8px;margin:6px 0;font-size:15px;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--bg);color:inherit">` : ""}
      <div style="font-size:12.5px;opacity:.75;margin-bottom:6px">One line = one bullet. <b>Enter</b> new bullet · <b>Tab</b> makes it a sub-bullet · <b>Shift+Tab</b> brings it back. Pasting a list keeps its levels. A line like <code>**Past**</code> or <code>## Past</code> starts a new section. ${edit ? "Saving replaces this bullet with your lines." : ""}</div>
      <textarea id="nv-ed-x" rows="14" style="width:100%;padding:10px;font:14px/1.55 ui-monospace,Menlo,Consolas,monospace;border:1px solid var(--border,#ccc);border-radius:8px;background:var(--bg);color:inherit" placeholder="${sect ? "Paste or type the bullets (optional now, you can add later)" : "Type or paste here…"}"></textarea>
      <div id="nv-ed-n" style="font-size:12.5px;opacity:.75;margin:6px 0"></div>
      <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
        <button class="btn small" id="nv-ed-sp" title="Turns pasted paragraphs into headings, bullets and sub-bullets. No AI, just rules: you can edit the result">✨ Auto-structure (split, shorten, make headings)</button>
        <span style="display:flex;gap:8px"><button class="btn" id="nv-ed-c">Cancel</button><button class="btn solid" id="nv-ed-s">Save (Ctrl+Enter)</button></span></div></div>`;
    document.body.appendChild(m);
    const ta = m.querySelector("#nv-ed-x"), cnt = m.querySelector("#nv-ed-n");
    if (edit) ta.value = o.text || "";
    const upd = () => { const bl = parse(ta.value, base, !sect); const all = bl.reduce((a, b) => a.concat(b.items), []); cnt.textContent = `${all.length} bullet${all.length === 1 ? "" : "s"} (${all.filter((x) => x[1]).length} sub-bullets)` + (bl.filter((b) => b.title).length ? ` · ${bl.filter((b) => b.title).length} new section(s)` : ""); };
    ta.onpaste = () => setTimeout(() => { if (ta.value.split("\n").some((l) => l.length > 140) || /\?\s*$/m.test(ta.value)) ta.value = smartText(ta.value, sect ? (m.querySelector("#nv-ed-t").value || "") : "", !sect); upd(); }, 0);
    ta.oninput = upd; upd(); setTimeout(() => (m.querySelector("#nv-ed-t") || ta).focus(), 30);
    ta.onkeydown = (e) => {
      const a = ta.selectionStart, v = ta.value, ls = v.lastIndexOf("\n", a - 1) + 1;
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) { const sp = (v.slice(ls).match(/^ {1,2}/) || [""])[0].length; if (sp) { ta.value = v.slice(0, ls) + v.slice(ls + sp); ta.selectionStart = ta.selectionEnd = Math.max(ls, a - sp); } }
        else { ta.value = v.slice(0, ls) + "  " + v.slice(ls); ta.selectionStart = ta.selectionEnd = a + 2; }
        upd();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); m.querySelector("#nv-ed-s").click(); }
      else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); const lead = (v.slice(ls, a).match(/^ */) || [""])[0];
        ta.value = v.slice(0, a) + "\n" + lead + v.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = a + 1 + lead.length; upd();
      }
    };
    m.querySelector("#nv-ed-sp").onclick = () => { ta.value = smartText(ta.value, sect ? (m.querySelector("#nv-ed-t").value || "") : "", !sect); upd(); };
    m.querySelector("#nv-ed-c").onclick = close;
    m.querySelector("#nv-ed-s").onclick = async () => {
      let blocks = parse(ta.value, base, !sect);
      if (sect) {
        let title = (m.querySelector("#nv-ed-t").value || "").trim();
        if (!title && blocks.length && blocks[0].title) { title = blocks[0].title; blocks[0].title = ""; } // first heading line becomes the title
        if (!title) { m.querySelector("#nv-ed-t").focus(); return; }
        if (blocks.length && blocks[0].title && norm(blocks[0].title) === norm(title)) blocks[0].title = ""; // same question typed twice: one section
        if (blocks.length && !blocks[0].title) blocks[0].title = title; else blocks.unshift({ title, starred: 0, items: [] });
      } else if (!blocks.length) { close(); return; }
      const secId = o.secId || (edit ? findSection(o.itemId) : null);
      try {
        const r = await fetch(o.theme ? "/api/theme-items/paste" : `/api/pages/${o.mtId}/paste`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: o.theme, sectionId: secId, replaceItemId: edit ? o.itemId : null, blocks }) });
        if (!r.ok) throw new Error(await r.text());
        close(); await refreshTree(); render();
      } catch (err) { cnt.innerHTML = `<span style="color:#b00">Could not save: ${esc(err.message)}</span>`; }
    };
  };
})();
