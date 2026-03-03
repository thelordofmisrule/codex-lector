/**
 * scripts/setup-db.js
 * Creates the SQLite database schema for Codex Lector.
 * Supports PlayShakespeare XML editions: ps, first-folio, ps-apocrypha, ps-poems.
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, "codex.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    bio TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#7A1E2E',
    oauth_provider TEXT,
    oauth_id TEXT,
    oauth_avatar TEXT,
    email TEXT,
    needs_onboarding BOOLEAN DEFAULT 0,
    is_admin BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS annotation_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES annotation_comments(id),
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS annotation_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    suggested_note TEXT NOT NULL,
    suggested_color INTEGER,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    resolved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    variant TEXT DEFAULT 'ps',
    authors TEXT DEFAULT 'William Shakespeare',
    content TEXT,
    fetched_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    line_id TEXT NOT NULL,
    note TEXT NOT NULL,
    color INTEGER DEFAULT 0,
    selected_text TEXT NOT NULL DEFAULT '',
    is_global BOOLEAN DEFAULT 0,
    layer_id INTEGER REFERENCES annotation_layers(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    work_id INTEGER NOT NULL REFERENCES works(id),
    line_id TEXT NOT NULL,
    line_text TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, work_id)
  );

  CREATE TABLE IF NOT EXISTS annotation_layers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT 0,
    subscriber_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS layer_subscriptions (
    user_id INTEGER NOT NULL REFERENCES users(id),
    layer_id INTEGER NOT NULL REFERENCES annotation_layers(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, layer_id)
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    work_id INTEGER NOT NULL REFERENCES works(id),
    lines_read INTEGER DEFAULT 0,
    total_lines INTEGER DEFAULT 0,
    max_line_reached INTEGER DEFAULT 0,
    last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, work_id)
  );

  CREATE TABLE IF NOT EXISTS word_index (
    word TEXT NOT NULL,
    work_id INTEGER NOT NULL REFERENCES works(id),
    count INTEGER DEFAULT 0,
    PRIMARY KEY (word, work_id)
  );

  CREATE TABLE IF NOT EXISTS discussions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_slug TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES discussions(id),
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS forum_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS forum_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES forum_threads(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES forum_replies(id),
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS forum_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#888'
  );

  CREATE TABLE IF NOT EXISTS forum_thread_tags (
    thread_id INTEGER NOT NULL REFERENCES forum_threads(id),
    tag_id INTEGER NOT NULL REFERENCES forum_tags(id),
    PRIMARY KEY (thread_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    header_image TEXT DEFAULT '',
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS blog_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES blog_posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES blog_replies(id),
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );
`);

// Migrations for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT '#7A1E2E'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_provider TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_id TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_avatar TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN needs_onboarding BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE annotations ADD COLUMN is_global BOOLEAN DEFAULT 0"); } catch {}
// Mark all existing annotations as global (they were admin-only before)
try { db.exec("UPDATE annotations SET is_global=1 WHERE is_global=0"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  line_id TEXT NOT NULL,
  line_text TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, work_id)
)`); } catch {}
try { db.exec("ALTER TABLE annotations ADD COLUMN layer_id INTEGER REFERENCES annotation_layers(id)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS annotation_layers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_public BOOLEAN DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS layer_subscriptions (
  user_id INTEGER NOT NULL REFERENCES users(id),
  layer_id INTEGER NOT NULL REFERENCES annotation_layers(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, layer_id)
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  lines_read INTEGER DEFAULT 0,
  total_lines INTEGER DEFAULT 0,
  max_line_reached INTEGER DEFAULT 0,
  last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, work_id)
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS word_index (
  word TEXT NOT NULL,
  work_id INTEGER NOT NULL REFERENCES works(id),
  count INTEGER DEFAULT 0,
  PRIMARY KEY (word, work_id)
)`); } catch {}
try { db.exec("ALTER TABLE blog_posts ADD COLUMN header_image TEXT DEFAULT ''"); } catch {}

// Seed forum tags
const tags = [
  ["Tragedies","#9B2335"],["Comedies","#2E7D32"],["Histories","#1565C0"],
  ["Sonnets & Poetry","#6A1B9A"],["Language & Rhetoric","#C9A84C"],
  ["Performance","#D84315"],["Scholarship","#37474F"],["General","#78909C"],
  ["First Folio","#8D6E63"],["Apocrypha","#5C6BC0"],
];
const insertTag = db.prepare("INSERT OR IGNORE INTO forum_tags (name,color) VALUES (?,?)");
for (const [n,c] of tags) insertTag.run(n,c);

// Create first admin user
const bcrypt = require("bcryptjs");
const admin = db.prepare("SELECT 1 FROM users WHERE username='admin'").get();
if (!admin) {
  db.prepare("INSERT INTO users (username,display_name,password_hash,is_admin) VALUES (?,?,?,1)")
    .run("admin", "Administrator", bcrypt.hashSync("codex2024", 10));
  console.log("Created admin user: admin / codex2024");
}

console.log("Database setup complete.");
db.close();
