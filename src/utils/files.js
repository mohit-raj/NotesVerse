const path = require("path");

const MIME_EXT_MAP = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf"
};

function extFromNameOrMime(name, mime) {
  const fromName = path.extname(name || "");
  if (fromName) return fromName;
  return MIME_EXT_MAP[mime] || "";
}

module.exports = { extFromNameOrMime };
