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

  CREATE TABLE IF NOT EXISTS place_edit_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    payload_json TEXT NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    resolved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_place_suggestions_place_status
    ON place_edit_suggestions(place_id, status, created_at);
  CREATE INDEX IF NOT EXISTS idx_place_suggestions_user_created
    ON place_edit_suggestions(user_id, created_at);

  CREATE TABLE IF NOT EXISTS place_create_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    payload_json TEXT NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    resolved_by INTEGER REFERENCES users(id),
    created_place_id INTEGER REFERENCES places(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_place_create_suggestions_status
    ON place_create_suggestions(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_place_create_suggestions_user
    ON place_create_suggestions(user_id, created_at);

  CREATE TABLE IF NOT EXISTS place_citation_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    work_slug TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    line_text TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(place_id, work_slug, line_number)
  );
  CREATE INDEX IF NOT EXISTS idx_place_citation_exclusions_place_created
    ON place_citation_exclusions(place_id, created_at);

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

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_key TEXT NOT NULL,
    work_slug TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
    ON chat_messages(room_key, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_work_created
    ON chat_messages(work_slug, created_at);

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
    lat REAL,
    lng REAL,
    description TEXT DEFAULT '',
    historical_note TEXT DEFAULT '',
    image_url TEXT DEFAULT '',
    aliases_json TEXT DEFAULT '[]',
    is_real BOOLEAN DEFAULT 1,
    source_plays_json TEXT DEFAULT '[]'
  );
`);

// Migrations for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT '#7A1E2E'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_provider TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_id TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_avatar TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN needs_onboarding BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("UPDATE users SET email=NULL WHERE email IS NOT NULL"); } catch {}
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
try { db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_key TEXT NOT NULL,
  work_slug TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_key, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_work_created ON chat_messages(work_slug, created_at)"); } catch {}
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
try { db.exec(`CREATE TABLE IF NOT EXISTS place_edit_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  payload_json TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  resolved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_place_suggestions_place_status ON place_edit_suggestions(place_id, status, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_place_suggestions_user_created ON place_edit_suggestions(user_id, created_at)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS place_create_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  payload_json TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  resolved_by INTEGER REFERENCES users(id),
  created_place_id INTEGER REFERENCES places(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_place_create_suggestions_status ON place_create_suggestions(status, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_place_create_suggestions_user ON place_create_suggestions(user_id, created_at)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS place_citation_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  work_slug TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  line_text TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(place_id, work_slug, line_number)
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_place_citation_exclusions_place_created ON place_citation_exclusions(place_id, created_at)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  modern_name TEXT DEFAULT '',
  place_type TEXT NOT NULL DEFAULT 'city',
  modern_country TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  description TEXT DEFAULT '',
  historical_note TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  aliases_json TEXT DEFAULT '[]',
  is_real BOOLEAN DEFAULT 1,
  source_plays_json TEXT DEFAULT '[]'
)`); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN modern_name TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN place_type TEXT NOT NULL DEFAULT 'city'"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN modern_country TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN description TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN historical_note TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN image_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN aliases_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN is_real BOOLEAN DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE places ADD COLUMN source_plays_json TEXT DEFAULT '[]'"); } catch {}

// Older DBs had NOT NULL lat/lng; rebuild to allow unknown coordinates.
try {
  const placeCols = db.prepare("PRAGMA table_info(places)").all();
  const latCol = placeCols.find(c => c.name === "lat");
  const lngCol = placeCols.find(c => c.name === "lng");
  const hasSourcePlays = placeCols.some(c => c.name === "source_plays_json");
  if ((latCol && latCol.notnull) || (lngCol && lngCol.notnull)) {
    const sourceSelect = hasSourcePlays ? "COALESCE(source_plays_json, '[]')" : "'[]'";
    db.exec(`
      ALTER TABLE places RENAME TO places_old;
      CREATE TABLE places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        modern_name TEXT DEFAULT '',
        place_type TEXT NOT NULL DEFAULT 'city',
        modern_country TEXT DEFAULT '',
        lat REAL,
        lng REAL,
        description TEXT DEFAULT '',
        historical_note TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        aliases_json TEXT DEFAULT '[]',
        is_real BOOLEAN DEFAULT 1,
        source_plays_json TEXT DEFAULT '[]'
      );
      INSERT INTO places (id, slug, name, modern_name, place_type, modern_country, lat, lng, description, historical_note, image_url, aliases_json, is_real, source_plays_json)
      SELECT id, slug, name, modern_name, place_type, modern_country, lat, lng, description, historical_note, image_url, aliases_json, is_real, ${sourceSelect}
      FROM places_old;
      DROP TABLE places_old;
    `);
  }
} catch (e) {
  console.warn("places schema migration skipped:", e.message);
}

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
  ["actium", "Actium", "Actium", "cape", "Greece", 38.9590, 20.7510, "A decisive Mediterranean naval site in Antony and Cleopatra.", "", "", JSON.stringify([])],
  ["alexandria", "Alexandria", "Alexandria", "city", "Egypt", 31.2001, 29.9187, "Cleopatra's court city and a major Mediterranean power center.", "", "", JSON.stringify([])],
  ["angers", "Angers", "Angers", "city", "France", 47.4784, -0.5632, "A French city setting in the histories.", "", "", JSON.stringify(["Angiers"])],
  ["antioch", "Antioch", "Antakya", "city", "Turkey", 36.2021, 36.1600, "Eastern Mediterranean city tied to Pericles.", "", "", JSON.stringify(["Antakya"])],
  ["antium", "Antium", "Anzio", "city", "Italy", 41.4475, 12.6288, "A coastal city associated with Coriolanus.", "", "", JSON.stringify([])],
  ["barnet", "Barnet", "Barnet", "town", "United Kingdom", 51.6538, -0.2003, "Site of a Wars of the Roses battle invoked in the histories.", "", "", JSON.stringify([])],
  ["bohemia", "Bohemia", "Bohemia", "region", "Czech Republic", 49.8175, 15.4730, "A central European region named in The Winter's Tale.", "", "", JSON.stringify([])],
  ["bordeaux", "Bordeaux", "Bordeaux", "city", "France", 44.8378, -0.5792, "A French city tied to the English-French wars in the histories.", "", "", JSON.stringify([])],
  ["bosworth-field", "Bosworth Field", "Market Bosworth", "battlefield", "United Kingdom", 52.5706, -1.4099, "Battlefield setting central to Richard III.", "", "", JSON.stringify(["Bosworth"])],
  ["britain", "Britain", "Great Britain", "island", "United Kingdom", 54.0037, -2.5479, "A broad insular setting in late romances and histories.", "", "", JSON.stringify(["Britaine"])],
  ["corioli", "Corioli", "Cori", "city", "Italy", 41.6437, 12.9127, "An Italian city associated with Coriolanus' military identity.", "", "", JSON.stringify(["Corioles"])],
  ["coventry", "Coventry", "Coventry", "city", "United Kingdom", 52.4068, -1.5197, "An English urban setting mentioned in the histories.", "", "", JSON.stringify([])],
  ["dover", "Dover", "Dover", "port", "United Kingdom", 51.1279, 1.3134, "A Channel crossing point and key setting in King Lear.", "", "", JSON.stringify([])],
  ["elsinore", "Elsinore", "Helsingor", "city", "Denmark", 56.0386, 12.6136, "Hamlet's Danish court city.", "", "", JSON.stringify(["Helsingør", "Helsingor", "Elsinor"])],
  ["ephesus", "Ephesus", "Selcuk", "city", "Turkey", 37.9390, 27.3410, "Classical city setting of The Comedy of Errors.", "", "", JSON.stringify([])],
  ["fife", "Fife", "Fife", "region", "United Kingdom", 56.2082, -3.1495, "Scottish region invoked in Macbeth.", "", "", JSON.stringify([])],
  ["forres", "Forres", "Forres", "town", "United Kingdom", 57.6097, -3.6185, "A northern Scottish setting in Macbeth.", "", "", JSON.stringify([])],
  ["harfleur", "Harfleur", "Harfleur", "port", "France", 49.5061, 0.1996, "Norman port made famous in Henry V.", "", "", JSON.stringify([])],
  ["illyria", "Illyria", "Illyrian Coast", "region", "Balkans", 42.9000, 19.2000, "Adriatic setting of Twelfth Night.", "", "", JSON.stringify([])],
  ["inverness", "Inverness", "Inverness", "city", "United Kingdom", 57.4778, -4.2247, "Highland city associated with Macbeth's castle world.", "", "", JSON.stringify([])],
  ["london", "London", "London", "city", "United Kingdom", 51.5074, -0.1278, "Capital setting across histories, comedies, and urban scenes.", "", "", JSON.stringify([])],
  ["mantua", "Mantua", "Mantova", "city", "Italy", 45.1564, 10.7914, "Northern Italian setting linked to Romeo and Juliet and Othello.", "", "", JSON.stringify([])],
  ["marseille", "Marseille", "Marseille", "port", "France", 43.2965, 5.3698, "Mediterranean port setting in All's Well That Ends Well.", "", "", JSON.stringify(["Marseilles"])],
  ["milford-haven", "Milford Haven", "Milford Haven", "port", "United Kingdom", 51.7120, -5.0340, "Welsh harbor setting in Cymbeline.", "", "", JSON.stringify(["Milford"])],
  ["mytilene", "Mytilene", "Mytilene", "city", "Greece", 39.1067, 26.5547, "Aegean city setting in Pericles.", "", "", JSON.stringify(["Mitylene"])],
  ["orleans", "Orleans", "Orleans", "city", "France", 47.9029, 1.9093, "French city repeatedly named in the Henry VI plays.", "", "", JSON.stringify(["Orléans"])],
  ["paris", "Paris", "Paris", "city", "France", 48.8566, 2.3522, "A major courtly and political setting in both histories and tragedies.", "", "", JSON.stringify([])],
  ["parthia", "Parthia", "Parthia", "region", "Iran", 34.0000, 53.0000, "An eastern imperial region invoked in Antony and Cleopatra.", "", "", JSON.stringify([])],
  ["pentapolis", "Pentapolis", "Cyrenaica", "region", "Libya", 32.8153, 21.8622, "A North African setting in Pericles.", "", "", JSON.stringify([])],
  ["philippi", "Philippi", "Philippi", "city", "Greece", 41.0083, 24.2843, "Battle setting in Julius Caesar.", "", "", JSON.stringify([])],
  ["rochester", "Rochester", "Rochester", "city", "United Kingdom", 51.3876, 0.5057, "Kentish city setting referenced in the histories.", "", "", JSON.stringify([])],
  ["rouen", "Rouen", "Rouen", "city", "France", 49.4431, 1.0993, "Norman city named in the Henry VI cycle.", "", "", JSON.stringify([])],
  ["roussillon", "Roussillon", "Roussillon", "region", "France", 42.6310, 2.9697, "Bertram's home region in All's Well That Ends Well.", "", "", JSON.stringify(["Rossillion", "Rousillon"])],
  ["salisbury", "Salisbury", "Salisbury", "city", "United Kingdom", 51.0688, -1.7945, "English cathedral city named in the histories.", "", "", JSON.stringify([])],
  ["sardis", "Sardis", "Sart", "city", "Turkey", 38.4804, 28.0325, "Ancient Anatolian city setting in Julius Caesar.", "", "", JSON.stringify([])],
  ["shrewsbury", "Shrewsbury", "Shrewsbury", "town", "United Kingdom", 52.7066, -2.7520, "Battle setting in Henry IV Part 1.", "", "", JSON.stringify([])],
  ["sicily", "Sicily", "Sicilia", "island", "Italy", 37.5999, 14.0154, "Mediterranean island setting in several comedies and romances.", "", "", JSON.stringify([])],
  ["southampton", "Southampton", "Southampton", "port", "United Kingdom", 50.9097, -1.4044, "English port setting tied to royal and military movement.", "", "", JSON.stringify([])],
  ["st-albans", "St Albans", "St Albans", "city", "United Kingdom", 51.7527, -0.3394, "Historic Hertfordshire city and battle setting in the histories.", "", "", JSON.stringify(["Saint Albans"])],
  ["st-edmundsbury", "St Edmundsbury", "Bury St Edmunds", "town", "United Kingdom", 52.2454, 0.7184, "Suffolk setting in the histories.", "", "", JSON.stringify(["Saint Edmundsbury", "Bury Saint Edmunds"])],
  ["tarsus", "Tarsus", "Tarsus", "city", "Turkey", 36.9177, 34.8928, "Cilician city setting in Pericles and Antony and Cleopatra.", "", "", JSON.stringify([])],
  ["tewkesbury", "Tewkesbury", "Tewkesbury", "town", "United Kingdom", 51.9924, -2.1600, "Battle setting in Henry VI Part 3.", "", "", JSON.stringify([])],
  ["thebes", "Thebes", "Thebes", "city", "Greece", 38.3250, 23.3180, "Classical Greek city setting in A Midsummer Night's Dream references.", "", "", JSON.stringify([])],
  ["troy", "Troy", "Hisarlik", "city", "Turkey", 39.9578, 26.2389, "Mythic-historical city central to Troilus and Cressida.", "", "", JSON.stringify(["Ilium"])],
  ["tyre", "Tyre", "Tyre", "city", "Lebanon", 33.2704, 35.2038, "Phoenician city setting in Pericles.", "", "", JSON.stringify([])],
  ["wakefield", "Wakefield", "Wakefield", "city", "United Kingdom", 53.6829, -1.4963, "Yorkshire battle setting in Henry VI Part 2.", "", "", JSON.stringify([])],
  ["wales", "Wales", "Wales", "region", "United Kingdom", 52.1307, -3.7837, "A recurring borderland and national setting in the histories.", "", "", JSON.stringify([])],
  ["windsor", "Windsor", "Windsor", "town", "United Kingdom", 51.4817, -0.6149, "Royal town setting of The Merry Wives of Windsor.", "", "", JSON.stringify([])],
  ["york", "York", "York", "city", "United Kingdom", 53.9590, -1.0815, "Northern English city central to dynastic conflict in the histories.", "", "", JSON.stringify([])],
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
