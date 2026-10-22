/* Adds a "PYQ Bank" button to the NotesVerse top bar, just before "Log out"
   (so Log out stays the last button), and keeps it there when the bar re-renders. */
(function () {
  function addLink() {
    const bar = document.getElementById("topbar");
    if (!bar || bar.querySelector("#pyq-bank-link")) return;
    const firstBtn = bar.querySelector(".btn");
    const right = (firstBtn && firstBtn.parentElement) || bar;
    const a = document.createElement("a");
    a.id = "pyq-bank-link";
    a.href = "/pyq.html";
    a.className = "btn";
    a.style.textDecoration = "none";
    a.textContent = "📝 PYQ Bank";
    const logout = right.querySelector('[onclick*="doLogout"]');
    if (logout) right.insertBefore(a, logout);
    else right.appendChild(a);
  }
  const bar = document.getElementById("topbar");
  if (bar) new MutationObserver(addLink).observe(bar, { childList: true });
  addLink();
})();
