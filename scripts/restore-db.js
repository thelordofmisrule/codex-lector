#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "codex.db");
const backupsDir = path.join(dataDir, "backups");

function resolveBackupPath() {
  const explicit = process.argv[2];
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.join(rootDir, explicit);
  }

  if (!fs.existsSync(backupsDir)) {
    console.error("No backups directory found.");
    process.exit(1);
  }

  const files = fs.readdirSync(backupsDir)
    .filter(name => name.endsWith(".db"))
    .map(name => path.join(backupsDir, name))
    .sort();

  const latest = files[files.length - 1];
  if (!latest) {
    console.error("No backup files found.");
    process.exit(1);
  }
  return latest;
}

function main() {
  const backupPath = resolveBackupPath();
  if (!fs.existsSync(backupPath)) {
    console.error(`Backup not found: ${backupPath}`);
    process.exit(1);
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const tempPath = `${dbPath}.restore`;
  fs.copyFileSync(backupPath, tempPath);
  fs.renameSync(tempPath, dbPath);

  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }

  console.log(`Restored ${backupPath} -> ${dbPath}`);
  console.log("Restart the service after restore.");
}

main();
