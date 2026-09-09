const express = require("express");
const config = require("../config");

const router = express.Router();

const SYSTEM_PROMPT =
  "You are a helpful, concise study assistant inside a personal UPSC civil services " +
  "exam-prep app. Give clear, accurate, exam-relevant answers.";

router.post("/chat", async (req, res) => {
  if (!config.geminiApiKey) {
    return res.status(400).json({
      error:
        "No API key set up yet. Copy config.example.json to config.json (if you haven't already) " +
        "and paste your Gemini API key (from aistudio.google.com) into \"geminiApiKey\", then restart the server."
    });
  }

  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Gemini uses "user"/"model" roles (not "assistant"), and a separate
  // systemInstruction field instead of a system message in the array.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const model = config.geminiModel || "gemini-3.1-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
      })
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || "Gemini request failed." });
    }
    const reply =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) ||
      "(no reply — the model may have blocked this response, try rephrasing)";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: "Could not reach Gemini: " + e.message });
  }
});

module.exports = router;
