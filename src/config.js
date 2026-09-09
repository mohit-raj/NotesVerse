const fs = require("fs");
const path = require("path");
const { rootDir } = require("./paths");

const DEFAULTS = {
  geminiApiKey: "",
  geminiModel: "gemini-3.1-flash-lite",
  appPassword: ""
};

const configPath = path.join(rootDir, "config.json");

let config = { ...DEFAULTS };
try {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config = { ...config, ...raw };
} catch (e) {
  console.warn(
    "config.json not found or invalid. Copy config.example.json to config.json and fill in your own values. " +
    "Until then, the AI chat box and password lock will show setup messages instead of working."
  );
}

module.exports = config;
