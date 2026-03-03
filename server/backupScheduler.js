const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.join(__dirname, "..");
const dbPath = path.join(rootDir, "data", "codex.db");
const backupsDir = path.join(rootDir, "data", "backups");
const checkEveryMs = 60 * 60 * 1000;
const intervalHours = Math.max(1, parseInt(process.env.AUTO_BACKUP_HOURS || "24", 10) || 24);

function latestBackupMtime() {
  if (!fs.existsSync(backupsDir)) return 0;
  const files = fs.readdirSync(backupsDir)
    .filter(name => name.endsWith(".db"))
    .map(name => path.join(backupsDir, name));
  if (!files.length) return 0;
  return Math.max(...files.map(file => fs.statSync(file).mtimeMs));
}

function shouldBackup() {
  const latest = latestBackupMtime();
  if (!latest) return true;
  return (Date.now() - latest) >= (intervalHours * 60 * 60 * 1000);
}

function runBackup() {
  if (process.env.DISABLE_AUTO_BACKUPS === "true") return;
  if (!fs.existsSync(dbPath)) return;
  if (!shouldBackup()) return;

  const child = spawn(process.execPath, [path.join(rootDir, "scripts", "backup-db.js"), "--label", "auto"], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { output += String(chunk); });
  child.on("close", code => {
    if (code === 0) console.log(`[backup] ${output.trim()}`);
    else console.error(`[backup] Failed: ${output.trim()}`);
  });
}

function initBackupScheduler() {
  setTimeout(runBackup, 15000);
  setInterval(runBackup, checkEveryMs);
}

module.exports = { initBackupScheduler };
