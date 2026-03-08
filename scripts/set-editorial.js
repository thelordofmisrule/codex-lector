#!/usr/bin/env node
const path = require("path");
const Database = require("better-sqlite3");

const rawUsername = process.argv[2];
if (!rawUsername) {
  console.error("Usage: node scripts/set-editorial.js <username>");
  process.exit(1);
}

const username = rawUsername.replace(/^@+/, "").trim().toLowerCase();
if (!username) {
  console.error("Username cannot be empty.");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "data", "codex.db");
const db = new Database(dbPath, { fileMustExist: true });

const user = db.prepare("SELECT id, username, display_name, is_admin, can_publish_global FROM users WHERE username=?").get(username);
if (!user) {
  console.error(`User not found: ${username}`);
  process.exit(1);
}

db.prepare("UPDATE users SET can_publish_global=1 WHERE id=?").run(user.id);
const updated = db.prepare("SELECT id, username, display_name, is_admin, can_publish_global FROM users WHERE id=?").get(user.id);

console.log(JSON.stringify({
  id: updated.id,
  username: updated.username,
  displayName: updated.display_name,
  isAdmin: !!updated.is_admin,
  canPublishGlobal: !!updated.can_publish_global,
}, null, 2));
