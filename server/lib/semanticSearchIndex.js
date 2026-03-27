const {
  embedTexts,
  getSemanticEmbeddingConfig,
  isSemanticEmbeddingConfigured,
} = require("./semanticEmbeddings");
const { buildSemanticChunksForWork } = require("./semanticSearchChunks");

function packEmbedding(values) {
  const array = Float32Array.from(values || []);
  return Buffer.from(array.buffer.slice(0));
}

function unpackEmbedding(blob) {
  if (!blob) return new Float32Array(0);
  return new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
}

function vectorNorm(values) {
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index] * values[index];
  return Math.sqrt(total) || 1;
}

function cosineSimilarity(queryVector, queryNorm, blob, rowNorm = 0) {
  const values = unpackEmbedding(blob);
  if (!values.length || !queryVector.length) return -1;
  const baseNorm = rowNorm || vectorNorm(values);
  let dot = 0;
  const length = Math.min(values.length, queryVector.length);
  for (let index = 0; index < length; index += 1) dot += values[index] * queryVector[index];
  return dot / (queryNorm * baseNorm);
}

function ensureSemanticSearchSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_search_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      work_slug TEXT NOT NULL,
      work_title TEXT NOT NULL,
      category TEXT NOT NULL,
      variant TEXT DEFAULT 'ps',
      chunk_type TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      label TEXT DEFAULT '',
      location_label TEXT DEFAULT '',
      speaker TEXT DEFAULT '',
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      display_line_start INTEGER NOT NULL,
      display_line_end INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB,
      embedding_norm REAL DEFAULT 0,
      embedding_model TEXT DEFAULT '',
      embedding_dimensions INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(work_id, chunk_type, scope_key, line_start, line_end)
    );

    CREATE INDEX IF NOT EXISTS idx_semantic_search_chunks_type
      ON semantic_search_chunks(chunk_type, work_slug, scope_key);
    CREATE INDEX IF NOT EXISTS idx_semantic_search_chunks_work
      ON semantic_search_chunks(work_id, chunk_type, line_start);
  `);
}

async function rebuildSemanticSearchIndex(db, options = {}) {
  ensureSemanticSearchSchema(db);
  if (!isSemanticEmbeddingConfigured()) {
    return {
      available: false,
      skipped: true,
      reason: "Semantic embeddings are not configured.",
      works: 0,
      chunks: 0,
      dimensions: getSemanticEmbeddingConfig().dimensions,
      model: getSemanticEmbeddingConfig().model,
    };
  }

  const logger = options.logger || console;
  const works = db.prepare(`
    SELECT id, slug, title, category, variant, content
    FROM works
    WHERE content IS NOT NULL
    ORDER BY id
  `).all();

  const chunks = [];
  works.forEach((work) => {
    const built = buildSemanticChunksForWork(work);
    chunks.push(...built);
  });

  const texts = chunks.map((chunk) => {
    const prefix = [
      chunk.workTitle,
      chunk.label,
      chunk.locationLabel,
    ].filter(Boolean).join(" · ");
    return `${prefix}\n\n${chunk.chunk_text || chunk.text || ""}`.trim();
  });
  const vectors = await embedTexts(texts, { logger, inputType: "document" });
  const config = getSemanticEmbeddingConfig();

  const clearRows = db.prepare("DELETE FROM semantic_search_chunks");
  const insertRow = db.prepare(`
    INSERT INTO semantic_search_chunks (
      work_id, work_slug, work_title, category, variant,
      chunk_type, scope_key, label, location_label, speaker,
      line_start, line_end, display_line_start, display_line_end,
      chunk_text, embedding, embedding_norm, embedding_model, embedding_dimensions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    clearRows.run();
    chunks.forEach((chunk, index) => {
      const vector = vectors[index] || [];
      insertRow.run(
        chunk.workId,
        chunk.workSlug,
        chunk.workTitle,
        chunk.category,
        chunk.variant || "ps",
        chunk.chunkType,
        chunk.scopeKey,
        chunk.label || "",
        chunk.locationLabel || "",
        chunk.speaker || "",
        chunk.lineStart,
        chunk.lineEnd,
        chunk.displayLineStart || chunk.lineStart,
        chunk.displayLineEnd || chunk.lineEnd,
        chunk.chunk_text || chunk.text || "",
        packEmbedding(vector),
        vectorNorm(vector),
        config.model,
        config.dimensions,
      );
    });
  });

  transaction();
  return {
    available: true,
    skipped: false,
    works: works.length,
    chunks: chunks.length,
    dimensions: config.dimensions,
    model: config.model,
  };
}

module.exports = {
  cosineSimilarity,
  ensureSemanticSearchSchema,
  getSemanticSearchStatus(db) {
    ensureSemanticSearchSchema(db);
    const chunkCount = Number(db.prepare("SELECT COUNT(*) AS count FROM semantic_search_chunks").get().count || 0);
    const sample = db.prepare(`
      SELECT embedding_model AS model, embedding_dimensions AS dimensions
      FROM semantic_search_chunks
      ORDER BY id DESC
      LIMIT 1
    `).get() || {};
    return {
      configured: isSemanticEmbeddingConfigured(),
      indexed: chunkCount > 0,
      chunkCount,
      model: sample.model || getSemanticEmbeddingConfig().model,
      dimensions: Number(sample.dimensions || getSemanticEmbeddingConfig().dimensions || 0),
    };
  },
  rebuildSemanticSearchIndex,
};
