const crypto = require("crypto");
const config = require("../config");

/* In-memory session store. Restarting the server logs everyone out —
   an acceptable trade-off for a personal, single-machine app. If you
   ever need sessions to survive restarts, swap this Set for a small
   table in the SQLite database. */
const validSessionTokens = new Set();

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

/* If config.appPassword is empty, the app is fully open (original,
   unlocked behaviour). Set a password in config.json to require login. */
function checkAuth(req, res, next) {
  if (!config.appPassword) return next();
  if (req.path === "/login.html" || req.path === "/api/login") return next();

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session && validSessionTokens.has(cookies.session)) return next();

  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Not logged in." });
  return res.redirect("/login.html");
}

module.exports = { checkAuth, parseCookies, validSessionTokens, generateToken };
