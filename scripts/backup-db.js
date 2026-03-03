#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "codex.db");
const backupsDir = path.join(dataDir, "backups");
const retentionDays = Math.max(1, parseInt(process.env.BACKUP_RETENTION_DAYS || "14", 10) || 14);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pruneOldBackups() {
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  for (const entry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(backupsDir, entry.name);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoff) fs.unlinkSync(fullPath);
  }
}

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    process.exit(1);
  }

  ensureDir(backupsDir);
  const labelArgIndex = process.argv.indexOf("--label");
  const rawLabel = labelArgIndex >= 0 ? (process.argv[labelArgIndex + 1] || "") : "";
  const label = rawLabel ? `-${rawLabel.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40)}` : "";
  const baseName = `codex-${stamp()}${label}`;
  const backupPath = path.join(backupsDir, `${baseName}.db`);
  const metaPath = path.join(backupsDir, `${baseName}.json`);

  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma("busy_timeout = 5000");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec(`VACUUM INTO ${sqlString(backupPath)}`);
  db.close();

  let gitCommit = "";
  try {
    gitCommit = require("child_process").execSync("git rev-parse HEAD", {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {}

  fs.writeFileSync(metaPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    backupPath,
    sourceDb: dbPath,
    gitCommit,
  }, null, 2));

  pruneOldBackups();
  console.log(backupPath);
}

main();
