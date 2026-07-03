const Database = require("better-sqlite3");
const path = require("path");
const db = new Database(path.join(__dirname, "..", "data", "codex.db"));
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL"); // durable enough under WAL, much faster writes
db.pragma("busy_timeout = 5000"); // wait for writers (backup/import scripts) instead of erroring
db.pragma("foreign_keys = ON");
module.exports = db;
