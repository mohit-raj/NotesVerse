const express = require("express");
const config = require("../config");
const { parseCookies, validSessionTokens, generateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/auth-status", (req, res) => {
  res.json({ enabled: !!config.appPassword });
});

router.post("/login", (req, res) => {
  if (!config.appPassword) return res.json({ ok: true }); // no lock configured

  if (req.body.password !== config.appPassword) {
    return res.status(401).json({ error: "Wrong password." });
  }

  const token = generateToken();
  validSessionTokens.add(token);
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`);
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session) validSessionTokens.delete(cookies.session);
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

module.exports = router;
