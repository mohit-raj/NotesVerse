/* One-time installer: wires the PYQ Bank into NotesVerse.
   Run from the project folder:  node tools/install-pyq.js
   It only adds two lines to src/app.js and one line to public/index.html,
   and it is safe to run more than once. */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

function edit(rel, check, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { console.log("!! missing " + rel + " - are you in the NotesVerse folder?"); process.exitCode = 1; return; }
  const src = fs.readFileSync(file, "utf8");
  if (src.includes(check)) { console.log("already done: " + rel); return; }
  const out = fn(src);
  if (out === src) { console.log("!! could not patch " + rel + " (unexpected contents) - see README-PYQ.txt for the manual step"); process.exitCode = 1; return; }
  fs.writeFileSync(file, out);
  console.log("updated: " + rel);
}

edit("src/app.js", "pyq.routes", (s) => {
  let o = s.replace(/(const chatRoutes = require\("\.\/routes\/chat\.routes"\);)/, '$1\nconst pyqRoutes = require("./routes/pyq.routes");');
  o = o.replace(/(app\.use\("\/api", chatRoutes\);)/, '$1\napp.use("/api", pyqRoutes);');
  return o;
});
edit("public/index.html", "pyq-link.js", (s) =>
  s.replace(/<script src="app\.js"><\/script>/, '<script src="app.js"></script>\n<script src="pyq-link.js"></script>'));
console.log("Done. Restart the server (Ctrl+C, then npm start).");
