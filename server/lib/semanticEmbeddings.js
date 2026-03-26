const OPENAI_API_URL = String(process.env.OPENAI_API_URL || "https://api.openai.com/v1/embeddings").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const EMBEDDING_MODEL = String(process.env.SEMANTIC_SEARCH_EMBED_MODEL || "text-embedding-3-small").trim();
const parsedDimensions = parseInt(process.env.SEMANTIC_SEARCH_EMBED_DIMENSIONS || "128", 10);
const EMBEDDING_DIMENSIONS = Number.isFinite(parsedDimensions)
  ? Math.max(64, Math.min(1536, parsedDimensions))
  : 128;
const EMBEDDING_BATCH_SIZE = 64;

function isSemanticEmbeddingConfigured() {
  return !!OPENAI_API_KEY;
}

function getSemanticEmbeddingConfig() {
  return {
    available: isSemanticEmbeddingConfigured(),
    provider: "openai",
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}

async function embedTexts(texts, options = {}) {
  if (!isSemanticEmbeddingConfigured()) {
    throw new Error("Semantic search is not configured on this server.");
  }

  const logger = options.logger || console;
  const values = Array.isArray(texts) ? texts.map((text) => String(text || "").trim()).filter(Boolean) : [];
  const vectors = [];

  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: batch,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.warn("Semantic embedding request failed:", response.status, body.slice(0, 300));
      throw new Error("Semantic embedding request failed.");
    }

    const payload = await response.json();
    const embeddings = Array.isArray(payload?.data) ? payload.data : [];
    embeddings
      .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
      .forEach((item) => {
        vectors.push(Array.isArray(item.embedding) ? item.embedding : []);
      });
  }

  return vectors;
}

module.exports = {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  getSemanticEmbeddingConfig,
  embedTexts,
  isSemanticEmbeddingConfigured,
};
