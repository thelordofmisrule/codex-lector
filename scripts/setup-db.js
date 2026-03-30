/**
 * scripts/setup-db.js
 * Creates the SQLite database schema for Codex Lector.
 * Supports PlayShakespeare XML editions: ps, first-folio, ps-apocrypha, ps-poems.
 */
const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch {}
const Database = require("better-sqlite3");
const fs = require("fs");
const crypto = require("crypto");
const { ensureSearchSchema, rebuildSearchIndex } = require("../server/lib/workSearchIndex");
const {
  ensureSemanticSearchSchema,
  rebuildSemanticSearchIndex,
  SEMANTIC_INDEX_BUILD_VERSION,
} = require("../server/lib/semanticSearchIndex");
const { getSemanticEmbeddingConfig } = require("../server/lib/semanticEmbeddings");
const { ensureSourceTextSchema } = require("../server/lib/sourceTexts");
const { ensureReaderIllustrationSchema } = require("../server/lib/readerIllustrations");
const { GLOSSARY_SEED, GLOSSARY_OVERRIDE_SEED } = require("../server/data/glossarySeed");
const { normalizeGlossaryTerm } = require("../server/lib/glossary");
const { compareWorkPreference } = require("../server/lib/workCatalog");
const { quoteImageSeedCollections, normalizeQuoteImageWorkKey } = require("../server/lib/quoteImageCollections");

const dir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, "codex.db"));
db.pragma("journal_mode = WAL");
ensureSourceTextSchema(db);
ensureReaderIllustrationSchema(db);

function digestParts(parts) {
  const hash = crypto.createHash("sha1");
  parts.forEach((part) => {
    hash.update(Buffer.isBuffer(part) ? part : String(part || ""));
    hash.update("\n");
  });
  return hash.digest("hex");
}

function digestFile(filePath) {
  try {
    return digestParts([fs.readFileSync(filePath)]);
  } catch {
    return "";
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS setup_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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
    can_publish_global BOOLEAN DEFAULT 0,
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
    suggested_kind TEXT DEFAULT 'note',
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
    kind TEXT DEFAULT 'note',
    color INTEGER DEFAULT 2,
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

  CREATE TABLE IF NOT EXISTS research_tray_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    title TEXT DEFAULT '',
    subtitle TEXT DEFAULT '',
    excerpt TEXT DEFAULT '',
    href TEXT DEFAULT '',
    work_slug TEXT DEFAULT '',
    work_title TEXT DEFAULT '',
    line_id TEXT DEFAULT '',
    line_number INTEGER DEFAULT 0,
    copy_text TEXT DEFAULT '',
    dedupe_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, dedupe_key)
  );
  CREATE INDEX IF NOT EXISTS idx_research_tray_items_user_updated
    ON research_tray_items(user_id, updated_at DESC);

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
    reply_to_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
    ON chat_messages(room_key, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_work_created
    ON chat_messages(work_slug, created_at);

  CREATE TABLE IF NOT EXISTS chat_room_memberships (
    user_id INTEGER NOT NULL REFERENCES users(id),
    room_key TEXT NOT NULL,
    work_slug TEXT,
    is_subscribed BOOLEAN DEFAULT 0,
    last_seen_message_id INTEGER DEFAULT 0,
    last_seen_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, room_key)
  );
  CREATE INDEX IF NOT EXISTS idx_chat_room_memberships_user_subscribed
    ON chat_room_memberships(user_id, is_subscribed, updated_at);

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

  CREATE TABLE IF NOT EXISTS prosody_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    line_key TEXT NOT NULL,
    line_text TEXT DEFAULT '',
    scan_text TEXT NOT NULL,
    stress_pattern TEXT NOT NULL,
    note_title TEXT DEFAULT '',
    note_body TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(work_id, line_key)
  );
  CREATE INDEX IF NOT EXISTS idx_prosody_overrides_work_line
    ON prosody_overrides(work_id, line_key);

  CREATE TABLE IF NOT EXISTS glossary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    headword TEXT UNIQUE NOT NULL,
    definition TEXT NOT NULL,
    source_label TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS glossary_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES glossary_entries(id) ON DELETE CASCADE,
    variant TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_glossary_variants_entry
    ON glossary_variants(entry_id);

  CREATE TABLE IF NOT EXISTS glossary_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    line_id TEXT NOT NULL DEFAULT '',
    normalized_word TEXT NOT NULL,
    definition TEXT NOT NULL,
    source_label TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(work_id, line_id, normalized_word)
  );
  CREATE INDEX IF NOT EXISTS idx_glossary_overrides_scope
    ON glossary_overrides(work_id, line_id, normalized_word);

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

  CREATE TABLE IF NOT EXISTS quote_image_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_key TEXT UNIQUE NOT NULL,
    work_title TEXT NOT NULL,
    work_slug TEXT DEFAULT '',
    category_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS quote_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES quote_image_collections(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    year TEXT DEFAULT '',
    source_label TEXT DEFAULT '',
    page_url TEXT DEFAULT '',
    image_url TEXT NOT NULL,
    local_media_path TEXT DEFAULT '',
    local_media_url TEXT DEFAULT '',
    external_ref TEXT,
    managed_source TEXT DEFAULT 'seed',
    manual_override BOOLEAN DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    tags_json TEXT DEFAULT '[]',
    thumb_x REAL DEFAULT 50,
    thumb_y REAL DEFAULT 50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, image_url)
  );
  CREATE INDEX IF NOT EXISTS idx_quote_images_collection_sort
    ON quote_images(collection_id, sort_order, id);

  CREATE TABLE IF NOT EXISTS quote_image_work_links (
    image_id INTEGER NOT NULL REFERENCES quote_images(id) ON DELETE CASCADE,
    work_slug TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id, work_slug)
  );
  CREATE INDEX IF NOT EXISTS idx_quote_image_work_links_work
    ON quote_image_work_links(work_slug, image_id);
`);

const getSetupState = db.prepare("SELECT value FROM setup_state WHERE key=?");
const setSetupState = db.prepare(`
  INSERT INTO setup_state (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET
    value=excluded.value,
    updated_at=CURRENT_TIMESTAMP
`);

// Migrations for existing databases
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar_color TEXT DEFAULT '#7A1E2E'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_provider TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_id TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN oauth_avatar TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN can_publish_global BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN needs_onboarding BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("UPDATE users SET email=NULL WHERE email IS NOT NULL"); } catch {}
try { db.exec("ALTER TABLE annotations ADD COLUMN is_global BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE annotations ADD COLUMN kind TEXT DEFAULT 'note'"); } catch {}
try { db.exec("ALTER TABLE annotation_suggestions ADD COLUMN suggested_kind TEXT DEFAULT 'note'"); } catch {}
try { db.exec(`
  UPDATE annotations
  SET kind = CASE COALESCE(color, 2)
    WHEN 0 THEN 'language'
    WHEN 1 THEN 'rhetoric'
    WHEN 2 THEN 'note'
    WHEN 3 THEN 'context'
    ELSE 'note'
  END
  WHERE kind IS NULL OR TRIM(kind) = ''
`); } catch {}
try { db.exec(`
  UPDATE annotation_suggestions
  SET suggested_kind = CASE
    WHEN suggested_color IS NULL THEN 'note'
    WHEN suggested_color = 0 THEN 'language'
    WHEN suggested_color = 1 THEN 'rhetoric'
    WHEN suggested_color = 2 THEN 'note'
    WHEN suggested_color = 3 THEN 'context'
    ELSE 'note'
  END
  WHERE suggested_kind IS NULL OR TRIM(suggested_kind) = ''
`); } catch {}
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
try { db.exec(`CREATE TABLE IF NOT EXISTS research_tray_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  title TEXT DEFAULT '',
  subtitle TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  href TEXT DEFAULT '',
  work_slug TEXT DEFAULT '',
  work_title TEXT DEFAULT '',
  line_id TEXT DEFAULT '',
  line_number INTEGER DEFAULT 0,
  copy_text TEXT DEFAULT '',
  dedupe_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, dedupe_key)
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_research_tray_items_user_updated ON research_tray_items(user_id, updated_at DESC)"); } catch {}
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
  reply_to_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
)`); } catch {}
try { db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_key, created_at)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_work_created ON chat_messages(work_slug, created_at)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS chat_room_memberships (
  user_id INTEGER NOT NULL REFERENCES users(id),
  room_key TEXT NOT NULL,
  work_slug TEXT,
  is_subscribed BOOLEAN DEFAULT 0,
  last_seen_message_id INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, room_key)
)`); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN work_slug TEXT"); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN is_subscribed BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN last_seen_message_id INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN last_seen_at DATETIME"); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("ALTER TABLE chat_room_memberships ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_chat_room_memberships_user_subscribed ON chat_room_memberships(user_id, is_subscribed, updated_at)"); } catch {}
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
try { db.exec(`CREATE TABLE IF NOT EXISTS prosody_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  line_key TEXT NOT NULL,
  line_text TEXT DEFAULT '',
  scan_text TEXT NOT NULL,
  stress_pattern TEXT NOT NULL,
  note_title TEXT DEFAULT '',
  note_body TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, line_key)
)`); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN line_text TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN note_title TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN note_body TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN created_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN updated_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("ALTER TABLE prosody_overrides ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_prosody_overrides_work_line ON prosody_overrides(work_id, line_key)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS glossary_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headword TEXT UNIQUE NOT NULL,
  definition TEXT NOT NULL,
  source_label TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch {}
try { db.exec("ALTER TABLE glossary_entries ADD COLUMN source_label TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE glossary_entries ADD COLUMN created_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE glossary_entries ADD COLUMN updated_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE glossary_entries ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("ALTER TABLE glossary_entries ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS glossary_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES glossary_entries(id) ON DELETE CASCADE,
  variant TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch {}
try { db.exec("ALTER TABLE glossary_variants ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_glossary_variants_entry ON glossary_variants(entry_id)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS glossary_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  line_id TEXT NOT NULL DEFAULT '',
  normalized_word TEXT NOT NULL,
  definition TEXT NOT NULL,
  source_label TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_id, line_id, normalized_word)
)`); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN line_id TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN source_label TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN created_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN updated_by INTEGER REFERENCES users(id)"); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("ALTER TABLE glossary_overrides ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_glossary_overrides_scope ON glossary_overrides(work_id, line_id, normalized_word)"); } catch {}
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
try { db.exec(`CREATE TABLE IF NOT EXISTS quote_image_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_key TEXT UNIQUE NOT NULL,
  work_title TEXT NOT NULL,
  work_slug TEXT DEFAULT '',
  category_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS quote_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES quote_image_collections(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  artist TEXT DEFAULT '',
  year TEXT DEFAULT '',
  source_label TEXT DEFAULT '',
  page_url TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  local_media_path TEXT DEFAULT '',
  local_media_url TEXT DEFAULT '',
  external_ref TEXT,
  managed_source TEXT DEFAULT 'seed',
  manual_override BOOLEAN DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  tags_json TEXT DEFAULT '[]',
  thumb_x REAL DEFAULT 50,
  thumb_y REAL DEFAULT 50,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(collection_id, image_url)
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_quote_images_collection_sort ON quote_images(collection_id, sort_order, id)"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_images_collection_external_ref ON quote_images(collection_id, external_ref)"); } catch {}
try { db.exec(`CREATE TABLE IF NOT EXISTS quote_image_work_links (
  image_id INTEGER NOT NULL REFERENCES quote_images(id) ON DELETE CASCADE,
  work_slug TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id, work_slug)
)`); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_quote_image_work_links_work ON quote_image_work_links(work_slug, image_id)"); } catch {}
try { db.exec("ALTER TABLE quote_image_collections ADD COLUMN work_slug TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_image_collections ADD COLUMN tags_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN title TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN artist TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN year TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN source_label TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN local_media_path TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN local_media_url TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN external_ref TEXT"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN managed_source TEXT DEFAULT 'seed'"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN manual_override BOOLEAN DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN tags_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN thumb_x REAL DEFAULT 50"); } catch {}
try { db.exec("ALTER TABLE quote_images ADD COLUMN thumb_y REAL DEFAULT 50"); } catch {}
try { db.exec("UPDATE quote_images SET external_ref=page_url WHERE (external_ref IS NULL OR external_ref='') AND COALESCE(page_url, '')<>''"); } catch {}
try { db.exec("UPDATE quote_images SET managed_source='seed' WHERE COALESCE(managed_source, '')=''"); } catch {}

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

// Seed glossary entries and contextual overrides without overwriting editorial edits.
const findGlossaryEntry = db.prepare("SELECT id FROM glossary_entries WHERE headword=?");
const insertGlossaryEntry = db.prepare(`
  INSERT INTO glossary_entries (headword, definition, source_label)
  VALUES (?, ?, ?)
`);
const insertGlossaryVariant = db.prepare(`
  INSERT OR IGNORE INTO glossary_variants (entry_id, variant)
  VALUES (?, ?)
`);
for (const seed of GLOSSARY_SEED) {
  const headword = normalizeGlossaryTerm(seed.headword);
  if (!headword) continue;
  const existing = findGlossaryEntry.get(headword);
  if (existing) continue;
  const result = insertGlossaryEntry.run(headword, String(seed.definition || "").trim(), String(seed.sourceLabel || "").trim());
  const entryId = Number(result.lastInsertRowid);
  for (const variant of seed.variants || []) {
    const normalizedVariant = normalizeGlossaryTerm(variant);
    if (!normalizedVariant || normalizedVariant === headword) continue;
    insertGlossaryVariant.run(entryId, normalizedVariant);
  }
}

const findGlossaryOverride = db.prepare(`
  SELECT id
  FROM glossary_overrides
  WHERE work_id=? AND line_id=? AND normalized_word=?
`);
const insertGlossaryOverride = db.prepare(`
  INSERT INTO glossary_overrides (work_id, line_id, normalized_word, definition, source_label)
  VALUES (?, ?, ?, ?, ?)
`);
const findWorkIdBySlug = db.prepare("SELECT id FROM works WHERE slug=?");
for (const seed of GLOSSARY_OVERRIDE_SEED) {
  const normalizedWord = normalizeGlossaryTerm(seed.lookupTerm);
  if (!normalizedWord) continue;
  const work = findWorkIdBySlug.get(seed.workSlug);
  if (!work) continue;
  const lineId = seed.scope === "line" ? String(seed.lineId || "").trim() : "";
  if (seed.scope === "line" && !lineId) continue;
  const existing = findGlossaryOverride.get(work.id, lineId, normalizedWord);
  if (existing) continue;
  insertGlossaryOverride.run(
    work.id,
    lineId,
    normalizedWord,
    String(seed.definition || "").trim(),
    String(seed.sourceLabel || "").trim()
  );
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

const quoteImageCollections = quoteImageSeedCollections();
const workRecords = db.prepare("SELECT slug, title, category FROM works").all();
const workRecordByKey = new Map();
workRecords.forEach((row) => {
  const key = normalizeQuoteImageWorkKey(row.title);
  const existing = workRecordByKey.get(key);
  if (!existing || compareWorkPreference(row, existing) < 0) {
    workRecordByKey.set(key, row);
  }
});
const upsertQuoteCollection = db.prepare(`
  INSERT INTO quote_image_collections (work_key, work_title, work_slug, category_url, notes, tags_json, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(work_key) DO UPDATE SET
    work_title=excluded.work_title,
    work_slug=excluded.work_slug,
    category_url=excluded.category_url,
    notes=excluded.notes,
    tags_json=excluded.tags_json,
    updated_at=CURRENT_TIMESTAMP
`);
const findQuoteCollection = db.prepare("SELECT id FROM quote_image_collections WHERE work_key=?");
const findSeededQuoteImage = db.prepare(`
  SELECT id, manual_override
  FROM quote_images
  WHERE collection_id=? AND external_ref=?
`);
const insertSeededQuoteImage = db.prepare(`
  INSERT INTO quote_images (
    collection_id, title, artist, year, source_label, page_url, image_url, local_media_path, local_media_url,
    external_ref, managed_source, manual_override, sort_order, tags_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 0, ?, ?)
`);
const updateSeededQuoteImage = db.prepare(`
  UPDATE quote_images
  SET
    title=?,
    artist=?,
    year=?,
    source_label=?,
    page_url=?,
    image_url=?,
    sort_order=?,
    tags_json=?,
    managed_source='seed'
  WHERE id=?
`);
const listSeededQuoteImagesForCollection = db.prepare(`
  SELECT id, external_ref, manual_override
  FROM quote_images
  WHERE collection_id=? AND managed_source='seed'
`);
const deleteQuoteImageById = db.prepare("DELETE FROM quote_images WHERE id=?");
const clearQuoteImageWorkLinks = db.prepare("DELETE FROM quote_image_work_links WHERE image_id=?");
const insertQuoteImageWorkLink = db.prepare(`
  INSERT OR IGNORE INTO quote_image_work_links (image_id, work_slug)
  VALUES (?, ?)
`);

function normalizeGalleryTag(rawTag) {
  const raw = String(rawTag || "").trim().replace(/^[\["']+|[\]"']+$/g, "");
  if (!raw) return "";
  if (raw.startsWith("slug:") || raw.startsWith("source:") || raw.startsWith("work:")) return "";
  if (raw.startsWith("category:")) return raw.slice("category:".length).trim();
  return raw;
}

function normalizeGalleryTags(tags) {
  return [...new Set(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => normalizeGalleryTag(tag))
      .filter(Boolean),
  )];
}

const listAllQuoteImageTags = db.prepare("SELECT id, tags_json FROM quote_images");
const updateQuoteImageTags = db.prepare("UPDATE quote_images SET tags_json=? WHERE id=?");
for (const row of listAllQuoteImageTags.all()) {
  let parsed = [];
  try {
    parsed = JSON.parse(row.tags_json || "[]");
  } catch {
    parsed = [];
  }
  const normalized = normalizeGalleryTags(parsed);
  if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
    updateQuoteImageTags.run(JSON.stringify(normalized), row.id);
  }
}

const quoteArtSeedSignature = digestParts([
  digestFile(path.join(__dirname, "..", "server", "data", "shakespeare_commons_images.json")),
  digestFile(path.join(__dirname, "..", "server", "data", "shakespeare_visa_images.json")),
]);
const quoteArtWorkSignature = digestParts(
  workRecords
    .map((row) => `${row.slug}|${row.title}|${row.category}`)
    .sort(),
);
const quoteArtSignature = digestParts(["quote-art-v3", quoteArtSeedSignature, quoteArtWorkSignature]);
const quoteArtStateKey = "quote_art_seed_signature";
const storedQuoteArtSignature = getSetupState.get(quoteArtStateKey)?.value || "";
const existingQuoteCollections = Number(db.prepare("SELECT COUNT(*) AS count FROM quote_image_collections").get().count || 0);
const existingSeededQuoteImages = Number(db.prepare("SELECT COUNT(*) AS count FROM quote_images WHERE managed_source='seed'").get().count || 0);
const shouldSyncQuoteArt = (
  storedQuoteArtSignature !== quoteArtSignature
  || existingQuoteCollections === 0
  || (quoteImageCollections.length > 0 && existingSeededQuoteImages === 0)
);

if (shouldSyncQuoteArt) {
  let quoteCollectionCount = 0;
  let quoteImageCount = 0;
  for (const collection of quoteImageCollections) {
    const workRecord = workRecordByKey.get(collection.workKey) || null;
    const linkedWorkSlugs = workRecord?.slug ? [workRecord.slug] : [];
    const collectionTags = normalizeGalleryTags([
      workRecord?.category || "",
      ...(Array.isArray(collection.tags) ? collection.tags : []),
    ]);
    upsertQuoteCollection.run(
      collection.workKey,
      collection.workTitle,
      workRecord?.slug || "",
      collection.categoryUrl,
      collection.notes,
      JSON.stringify(collectionTags),
    );
    const stored = findQuoteCollection.get(collection.workKey);
    if (!stored) continue;
    quoteCollectionCount += 1;
    const seenExternalRefs = new Set();
    collection.images.forEach((image) => {
      const rawLabelSource = image.title
        ? String(image.title)
        : String(image.pageUrl || image.imageUrl || "");
      const normalizedLabel = (rawLabelSource.split("/").pop() || `image-${(image.sortOrder || 0) + 1}`)
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/^File:/i, "")
        .replace(/^Special:FilePath\//i, "")
        .replace(/[_-]+/g, " ")
        .trim();
      const imageTags = normalizeGalleryTags([
        ...collectionTags,
        ...(Array.isArray(image.tags) ? image.tags : []),
      ]);
      const externalRef = String(image.pageUrl || image.imageUrl || "").trim() || null;
      if (externalRef) seenExternalRefs.add(externalRef);
      const existing = externalRef ? findSeededQuoteImage.get(stored.id, externalRef) : null;

      let imageId = existing?.id || 0;
      if (!existing) {
        const inserted = insertSeededQuoteImage.run(
          stored.id,
          normalizedLabel,
          image.artist || "",
          image.year || "",
          image.sourceLabel || "Wikimedia Commons",
          image.pageUrl,
          image.imageUrl,
          image.localMediaPath || "",
          image.localMediaUrl || "",
          externalRef,
          image.sortOrder,
          JSON.stringify(imageTags),
        );
        imageId = inserted.lastInsertRowid;
      } else if (!existing.manual_override) {
        updateSeededQuoteImage.run(
          normalizedLabel,
          image.artist || "",
          image.year || "",
          image.sourceLabel || "Wikimedia Commons",
          image.pageUrl,
          image.imageUrl,
          image.sortOrder,
          JSON.stringify(imageTags),
          existing.id,
        );
      }

      if (imageId && !existing?.manual_override) {
        clearQuoteImageWorkLinks.run(imageId);
        linkedWorkSlugs.forEach((workSlug) => insertQuoteImageWorkLink.run(imageId, workSlug));
      }
      quoteImageCount += 1;
    });

    const staleSeededImages = listSeededQuoteImagesForCollection.all(stored.id);
    staleSeededImages.forEach((image) => {
      if (image.manual_override) return;
      if (image.external_ref && !seenExternalRefs.has(image.external_ref)) {
        deleteQuoteImageById.run(image.id);
      }
    });
  }
  setSetupState.run(quoteArtStateKey, quoteArtSignature);
  if (quoteCollectionCount > 0) {
    console.log(`Seeded quote art collections: ${quoteCollectionCount} works, ${quoteImageCount} images.`);
  }
}

const bcrypt = require("bcryptjs");
const petruch10 = db.prepare("SELECT id FROM users WHERE username='petruch10'").get();
if (petruch10) {
  const legacyAdmin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  const promotePetruch10 = db.prepare(`
    UPDATE users
    SET is_admin=1, can_publish_global=1
    WHERE id=?
      AND (COALESCE(is_admin, 0) <> 1 OR COALESCE(can_publish_global, 0) <> 1)
  `).run(petruch10.id);
  const demoteLegacyAdmin = db.prepare(`
    UPDATE users
    SET can_publish_global=0
    WHERE username='admin'
      AND COALESCE(can_publish_global, 0) <> 0
  `).run();
  if (legacyAdmin && legacyAdmin.id !== petruch10.id) {
    const migratedAnnotations = db.prepare("UPDATE annotations SET user_id=? WHERE is_global=1 AND user_id=?").run(petruch10.id, legacyAdmin.id);
    if (migratedAnnotations.changes > 0) {
      console.log("Migrated legacy site-wide annotations from admin to @petruch10.");
    }
  }
  if (promotePetruch10.changes > 0 || demoteLegacyAdmin.changes > 0) {
    console.log("Synced editorial role to @petruch10.");
  }
}

// Optional bootstrap admin user for fresh installs. Set ADMIN_BOOTSTRAP_PASSWORD in .env to enable.
const bootstrapAdminUsername = String(process.env.ADMIN_BOOTSTRAP_USERNAME || "admin").trim().toLowerCase();
const bootstrapAdminPassword = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
const admin = db.prepare("SELECT 1 FROM users WHERE username=?").get(bootstrapAdminUsername);
if (bootstrapAdminPassword && !admin) {
  db.prepare("INSERT INTO users (username,display_name,password_hash,is_admin) VALUES (?,?,?,1)")
    .run(bootstrapAdminUsername, "Administrator", bcrypt.hashSync(bootstrapAdminPassword, 10));
  console.log(`Created bootstrap admin user: ${bootstrapAdminUsername}`);
} else if (!bootstrapAdminPassword && !admin) {
  console.log("No bootstrap admin created. Sign in via OAuth, then run node scripts/set-admin.js <username> if needed.");
}

ensureSearchSchema(db);
ensureSemanticSearchSchema(db);
const searchCodeSignature = digestParts([
  digestFile(path.join(__dirname, "..", "server", "lib", "workSearch.js")),
  digestFile(path.join(__dirname, "..", "server", "lib", "workSearchIndex.js")),
]);
const searchInputState = db.prepare(`
  SELECT COUNT(*) AS works, COALESCE(MAX(fetched_at), '') AS max_fetched_at
  FROM works
  WHERE content IS NOT NULL
`).get();
const indexedLineCount = Number(db.prepare("SELECT COUNT(*) AS count FROM work_search_lines").get().count || 0);
const searchStateSignature = digestParts([
  "search-index-v2",
  String(searchInputState.works || 0),
  String(searchInputState.max_fetched_at || ""),
  searchCodeSignature,
]);
const searchStateKey = "search_index_signature";
const storedSearchSignature = getSetupState.get(searchStateKey)?.value || "";
const shouldRebuildSearch = (
  storedSearchSignature !== searchStateSignature
  || (Number(searchInputState.works || 0) > 0 && indexedLineCount === 0)
);

if (shouldRebuildSearch) {
  const searchSummary = rebuildSearchIndex(db, { logger: console });
  setSetupState.run(searchStateKey, searchStateSignature);
  console.log(`Search index ready: ${searchSummary.lines} searchable lines across ${searchSummary.works} works.${searchSummary.ftsEnabled ? " FTS enabled." : " FTS unavailable; using fallback search."}`);
}

const semanticConfig = getSemanticEmbeddingConfig();
const semanticStateSignature = digestParts([
  "semantic-search-v2",
  String(searchInputState.works || 0),
  String(searchInputState.max_fetched_at || ""),
  SEMANTIC_INDEX_BUILD_VERSION,
  semanticConfig.provider,
  semanticConfig.model,
  String(semanticConfig.dimensions),
]);
const semanticStateKey = "semantic_search_signature";
const storedSemanticSignature = getSetupState.get(semanticStateKey)?.value || "";
const indexedSemanticChunks = Number(db.prepare("SELECT COUNT(*) AS count FROM semantic_search_chunks").get().count || 0);
const forceSemanticRebuild = String(process.env.FORCE_SEMANTIC_REBUILD || "") === "1";
const shouldRebuildSemantic = (
  semanticConfig.available
  && (
    forceSemanticRebuild
    || storedSemanticSignature !== semanticStateSignature
    || (Number(searchInputState.works || 0) > 0 && indexedSemanticChunks === 0)
  )
);

if (shouldRebuildSemantic) {
  if (forceSemanticRebuild) {
    console.log("Forcing semantic search rebuild because FORCE_SEMANTIC_REBUILD=1.");
  }
  rebuildSemanticSearchIndex(db, { logger: console })
    .then((summary) => {
      if (!summary.skipped) {
        setSetupState.run(semanticStateKey, semanticStateSignature);
        console.log(`Semantic search ready: ${summary.chunks} chunks across ${summary.works} works (${summary.model}, ${summary.dimensions}d).`);
      }
      console.log("Database setup complete.");
      db.close();
    })
    .catch((error) => {
      console.warn(`Semantic search rebuild skipped: ${error.message}`);
      console.log("Database setup complete.");
      db.close();
    });
} else {
  if (!semanticConfig.available && indexedSemanticChunks === 0) {
    console.log("Semantic search not configured. Set OPENAI_API_KEY or VOYAGE_API_KEY to build semantic embeddings.");
  }

  console.log("Database setup complete.");
  db.close();
}
