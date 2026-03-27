const OPENAI_API_URL = String(process.env.OPENAI_API_URL || "https://api.openai.com/v1/embeddings").trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const VOYAGE_API_URL = String(process.env.VOYAGE_API_URL || "https://api.voyageai.com/v1/embeddings").trim();
const VOYAGE_API_KEY = String(process.env.VOYAGE_API_KEY || "").trim();
const PROVIDER_OVERRIDE = String(process.env.SEMANTIC_EMBED_PROVIDER || "auto").trim().toLowerCase();
const MODEL_OVERRIDE = String(process.env.SEMANTIC_SEARCH_EMBED_MODEL || "").trim();
const parsedDimensions = parseInt(process.env.SEMANTIC_SEARCH_EMBED_DIMENSIONS || "", 10);
const EMBEDDING_BATCH_SIZE = 64;
const VOYAGE_ALLOWED_DIMENSIONS = [256, 512, 1024, 2048];

function resolveProvider() {
  if (PROVIDER_OVERRIDE === "openai" && OPENAI_API_KEY) return "openai";
  if (PROVIDER_OVERRIDE === "voyage" && VOYAGE_API_KEY) return "voyage";
  if (PROVIDER_OVERRIDE !== "auto") return "";
  if (VOYAGE_API_KEY) return "voyage";
  if (OPENAI_API_KEY) return "openai";
  return "";
}

function normalizeOpenAIDimensions(value) {
  if (!Number.isFinite(value)) return 128;
  return Math.max(64, Math.min(1536, value));
}

function normalizeVoyageDimensions(value) {
  if (!Number.isFinite(value)) return 256;
  if (VOYAGE_ALLOWED_DIMENSIONS.includes(value)) return value;
  if (value < VOYAGE_ALLOWED_DIMENSIONS[0]) return VOYAGE_ALLOWED_DIMENSIONS[0];
  for (const allowed of VOYAGE_ALLOWED_DIMENSIONS) {
    if (value <= allowed) return allowed;
  }
  return VOYAGE_ALLOWED_DIMENSIONS[VOYAGE_ALLOWED_DIMENSIONS.length - 1];
}

function getSemanticEmbeddingConfig() {
  const provider = resolveProvider();
  if (provider === "voyage") {
    return {
      available: true,
      provider,
      model: MODEL_OVERRIDE || "voyage-3.5-lite",
      dimensions: normalizeVoyageDimensions(parsedDimensions),
      apiUrl: VOYAGE_API_URL,
    };
  }
  if (provider === "openai") {
    return {
      available: true,
      provider,
      model: MODEL_OVERRIDE || "text-embedding-3-small",
      dimensions: normalizeOpenAIDimensions(parsedDimensions),
      apiUrl: OPENAI_API_URL,
    };
  }
  return {
    available: false,
    provider: "",
    model: MODEL_OVERRIDE || "",
    dimensions: Number.isFinite(parsedDimensions) ? parsedDimensions : 0,
    apiUrl: "",
  };
}

function isSemanticEmbeddingConfigured() {
  return getSemanticEmbeddingConfig().available;
}

async function embedOpenAI(batch, config, logger) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: batch,
      model: config.model,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn("Semantic embedding request failed:", response.status, body.slice(0, 300));
    throw new Error("Semantic embedding request failed.");
  }

  const payload = await response.json();
  const embeddings = Array.isArray(payload?.data) ? payload.data : [];
  return embeddings
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((item) => (Array.isArray(item.embedding) ? item.embedding : []));
}

async function embedVoyage(batch, config, logger, inputType) {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: batch,
      model: config.model,
      input_type: inputType === "query" ? "query" : "document",
      output_dimension: config.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn("Semantic embedding request failed:", response.status, body.slice(0, 300));
    throw new Error("Semantic embedding request failed.");
  }

  const payload = await response.json();
  const embeddings = Array.isArray(payload?.data) ? payload.data : [];
  return embeddings
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
    .map((item) => (Array.isArray(item.embedding) ? item.embedding : []));
}

async function embedTexts(texts, options = {}) {
  const config = getSemanticEmbeddingConfig();
  if (!config.available) {
    throw new Error("Semantic search is not configured on this server.");
  }

  const logger = options.logger || console;
  const inputType = options.inputType === "query" ? "query" : "document";
  const values = Array.isArray(texts) ? texts.map((text) => String(text || "").trim()).filter(Boolean) : [];
  const vectors = [];

  for (let index = 0; index < values.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = values.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddedBatch = config.provider === "voyage"
      ? await embedVoyage(batch, config, logger, inputType)
      : await embedOpenAI(batch, config, logger);
    vectors.push(...embeddedBatch);
  }

  return vectors;
}

const resolvedConfig = getSemanticEmbeddingConfig();

module.exports = {
  EMBEDDING_DIMENSIONS: resolvedConfig.dimensions,
  EMBEDDING_MODEL: resolvedConfig.model,
  getSemanticEmbeddingConfig,
  embedTexts,
  isSemanticEmbeddingConfigured,
};
