const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("../../db/index.js");
const { uid } = require("../utils/id");
const { extFromNameOrMime } = require("../utils/files");
const { uploadsDir } = require("../paths");

const router = express.Router();

router.post("/attachments", (req, res) => {
  const { microthemeId, filename, mimeType, dataBase64 } = req.body;
  if (!microthemeId || !dataBase64) return res.status(400).json({ error: "microthemeId and dataBase64 required" });

  const id = uid();
  const ext = extFromNameOrMime(filename, mimeType);
  const storedName = id + ext;
  const buffer = Buffer.from(dataBase64, "base64");

  try {
    fs.writeFileSync(path.join(uploadsDir, storedName), buffer);
  } catch (e) {
    return res.status(500).json({ error: "Failed to save file: " + e.message });
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order),-1) m FROM attachments WHERE microtheme_id=?").get(microthemeId).m;
  db.prepare("INSERT INTO attachments (id,microtheme_id,filename,original_name,mime_type,sort_order) VALUES (?,?,?,?,?,?)")
    .run(id, microthemeId, storedName, filename || storedName, mimeType || "application/octet-stream", maxOrder + 1);

  res.json({ id, filename: storedName });
});

router.delete("/attachments/:id", (req, res) => {
  const row = db.prepare("SELECT filename FROM attachments WHERE id=?").get(req.params.id);
  db.prepare("DELETE FROM attachments WHERE id=?").run(req.params.id);
  if (row) {
    try { fs.unlinkSync(path.join(uploadsDir, row.filename)); } catch (e) { /* file already gone, ignore */ }
  }
  res.json({ ok: true });
});

module.exports = router;
