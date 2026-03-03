const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const logDir = path.join(rootDir, "logs");
const retentionDays = Math.max(1, parseInt(process.env.LOG_RETENTION_DAYS || "14", 10) || 14);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pruneOldLogs() {
  try {
    ensureDir(logDir);
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".log")) continue;
      const fullPath = path.join(logDir, entry.name);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fullPath);
    }
  } catch (err) {
    process.stderr.write(`[logger] Failed to prune logs: ${err.message}\n`);
  }
}

function logFilePath() {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(logDir, `app-${stamp}.log`);
}

function serialize(args) {
  return args.map((value) => {
    if (value instanceof Error) return value.stack || value.message;
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" ");
}

function patchConsoleMethod(name) {
  const original = console[name].bind(console);
  console[name] = (...args) => {
    original(...args);
    try {
      ensureDir(logDir);
      const line = `[${new Date().toISOString()}] [${name.toUpperCase()}] ${serialize(args)}\n`;
      fs.appendFileSync(logFilePath(), line);
    } catch (err) {
      original(`[logger] Failed to write log: ${err.message}`);
    }
  };
}

function initLogger() {
  ensureDir(logDir);
  pruneOldLogs();
  ["log", "warn", "error"].forEach(patchConsoleMethod);
}

module.exports = { initLogger };
