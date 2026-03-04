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

  CREATE TABLE IF NOT EXISTS content_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id),
    visitor_id TEXT,
    path TEXT DEFAULT '',
    meta_json TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    modern_name TEXT DEFAULT '',
    place_type TEXT NOT NULL DEFAULT 'city',
    modern_country TEXT DEFAULT '',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    description TEXT DEFAULT '',
    historical_note TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    aliases_json TEXT DEFAULT '[]',
    is_real BOOLEAN DEFAULT 1
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
try { db.exec(`CREATE TABLE IF NOT EXISTS content_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  resolved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  visitor_id TEXT,
  path TEXT DEFAULT '',
  meta_json TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  modern_name TEXT DEFAULT '',
  place_type TEXT NOT NULL DEFAULT 'city',
  modern_country TEXT DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  description TEXT DEFAULT '',
  historical_note TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  aliases_json TEXT DEFAULT '[]',
  is_real BOOLEAN DEFAULT 1
)`); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN modern_name TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN place_type TEXT NOT NULL DEFAULT 'city'"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN modern_country TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN description TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN historical_note TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN aliases_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN is_real BOOLEAN DEFAULT 1"); } catch {}

// Seed forum tags
const tags = [
  ["Tragedies","#9B2335"],["Comedies","#2E7D32"],["Histories","#1565C0"],
  ["Sonnets & Poetry","#6A1B9A"],["Language & Rhetoric","#C9A84C"],
  ["Performance","#D84315"],["Scholarship","#37474F"],["General","#78909C"],
  ["First Folio","#8D6E63"],["Apocrypha","#5C6BC0"],["Authorship","#6B4F2A"],
];
const insertTag = db.prepare("INSERT OR IGNORE INTO forum_tags (name,color) VALUES (?,?)");
for (const [n,c] of tags) insertTag.run(n,c);

// Seed a curated starter geography of real places.
const seededPlaces = [
  ["athens", "Athens", "Athina", "city", "Greece", 37.9838, 23.7275, "A classical city of philosophy, law, and myth that recurs throughout the canon.", "For Shakespeare and his audience, Athens signaled both antiquity and a living site of law, education, and erotic disorder.", "", JSON.stringify([])],
  ["cyprus", "Cyprus", "Cyprus", "island", "Cyprus", 35.1264, 33.4299, "An eastern Mediterranean island central to trade, war, and Othello's military setting.", "In the late sixteenth century Cyprus stood at the fault line between Venetian maritime power and Ottoman expansion.", "", JSON.stringify([])],
  ["denmark", "Denmark", "Danmark", "kingdom", "Denmark", 56.2639, 9.5018, "A northern kingdom associated above all with Hamlet and the Danish court.", "To an English audience, Denmark was both a real northern monarchy and a space of cold, watchful dynastic unease.", "", JSON.stringify([])],
  ["egypt", "Egypt", "Egypt", "kingdom", "Egypt", 26.8206, 30.8025, "A political and erotic counterworld to Rome in Antony and Cleopatra.", "Shakespeare's Egypt is filtered through classical sources: a wealthy, ancient kingdom imagined as luxurious, strategic, and sensuous.", "", JSON.stringify([])],
  ["england", "England", "England", "kingdom", "United Kingdom", 52.3555, -1.1743, "The political heart of the histories and the most frequently invoked realm in the plays.", "For Shakespeare, England is never neutral ground: it is the contested theatre of succession, legitimacy, war, and memory.", "", JSON.stringify([])],
  ["florence", "Florence", "Firenze", "city", "Italy", 43.7696, 11.2558, "A Renaissance city linked to soldiers, courts, and Italian political texture.", "Elizabethan readers knew Florence as a courtly and martial Italian center, often mediated through travel writing and translated novelle.", "", JSON.stringify([])],
  ["flushing", "Flushing", "Vlissingen", "port", "Netherlands", 51.4426, 3.5736, "A Dutch port on the Scheldt estuary, named in the histories and military contexts.", "In Shakespeare's day Flushing was an English-garrisoned cautionary port in the Low Countries, tied to continental war and Protestant statecraft.", "", JSON.stringify(["Vlissingen"])],
  ["france", "France", "France", "kingdom", "France", 46.2276, 2.2137, "England's nearest rival and ally, invoked constantly in histories and comedies alike.", "France in the plays is both a neighboring kingdom and the indispensable foreign mirror for English power.", "", JSON.stringify([])],
  ["messina", "Messina", "Messina", "city", "Italy", 38.1938, 15.5540, "The Sicilian setting of Much Ado About Nothing.", "Messina would have read as a Mediterranean threshold city: strategic, aristocratic, and deeply tied to Spanish and Italian politics.", "", JSON.stringify([])],
  ["milan", "Milan", "Milano", "city", "Italy", 45.4642, 9.1900, "A ducal city tied to exile, restoration, and courtly intrigue.", "Milan carried associations of ducal statecraft, mercenary politics, and northern Italian sophistication.", "", JSON.stringify([])],
  ["navarre", "Navarre", "Navarra", "kingdom", "Spain", 42.6954, -1.6761, "A Pyrenean kingdom associated with academies, wit, and diplomatic comedy.", "Navarre was a small but politically charged kingdom at the edge of France and Spain, useful for learned play and diplomatic comedy.", "", JSON.stringify([])],
  ["padua", "Padua", "Padova", "city", "Italy", 45.4064, 11.8768, "A learned university city named in The Taming of the Shrew and other Italianate plays.", "Padua's university made it shorthand for cosmopolitan learning, logic, and fashionable Italian urbanity.", "", JSON.stringify([])],
  ["rome", "Rome", "Roma", "city", "Italy", 41.9028, 12.4964, "The imperial city of republican virtue, conspiracy, and tragic statecraft.", "Rome arrives already layered with classical authority: republic, empire, civic ideal, and blood-soaked precedent.", "", JSON.stringify([])],
  ["scotland", "Scotland", "Scotland", "kingdom", "United Kingdom", 56.4907, -4.2026, "A haunted northern kingdom tied to succession, prophecy, and Macbeth.", "On the Jacobean stage Scotland was both neighboring polity and present-tense dynastic matter under James VI and I.", "", JSON.stringify([])],
  ["venice", "Venice", "Venezia", "city", "Italy", 45.4408, 12.3155, "A mercantile republic of law, credit, outsiders, and theatrical disguise.", "Venice signified trade, cosmopolitanism, strict law, and the moral ambiguities of wealth and empire.", "", JSON.stringify([])],
  ["verona", "Verona", "Verona", "city", "Italy", 45.4384, 10.9916, "A northern Italian city remembered above all for Romeo and Juliet.", "Verona enters English imagination through Italian tale tradition: aristocratic households, factional violence, and civic honor.", "", JSON.stringify([])],
  ["vienna", "Vienna", "Wien", "city", "Austria", 48.2082, 16.3738, "The setting of Measure for Measure, imagined as a city of law, appetite, and surveillance.", "Vienna functions less as a travel-guide city than as a concentrated capital of discipline, delegated power, and hidden vice.", "", JSON.stringify([])],
];
const upsertPlace = db.prepare(`
  INSERT INTO places (slug, name, modern_name, place_type, modern_country, lat, lng, description, historical_note, image_url, aliases_json, is_real)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(slug) DO UPDATE SET
    name=excluded.name,
    modern_name=excluded.modern_name,
    place_type=excluded.place_type,
    modern_country=excluded.modern_country,
    lat=excluded.lat,
    lng=excluded.lng,
    description=excluded.description,
    historical_note=excluded.historical_note,
    image_url=excluded.image_url,
    aliases_json=excluded.aliases_json,
    is_real=1
`);
for (const row of seededPlaces) upsertPlace.run(...row);

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
