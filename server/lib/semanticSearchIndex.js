const {
  embedTexts,
  getSemanticEmbeddingConfig,
  isSemanticEmbeddingConfigured,
  SEMANTIC_EMBED_REQUEST_VERSION,
} = require("./semanticEmbeddings");
const {
  buildSemanticScaffoldForWork,
  SEMANTIC_SCAFFOLD_VERSION,
} = require("./semanticSearchChunks");

const SEMANTIC_INDEX_BUILD_VERSION = [
  "1",
  SEMANTIC_SCAFFOLD_VERSION,
  SEMANTIC_EMBED_REQUEST_VERSION,
].join(":");

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

function cosineBetweenVectors(left, right) {
  if (!left?.length || !right?.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    dot += l * r;
    leftNorm += l * l;
    rightNorm += r * r;
  }
  return dot / ((Math.sqrt(leftNorm) || 1) * (Math.sqrt(rightNorm) || 1));
}

function averageVectors(vectors) {
  const filtered = (vectors || []).filter((vector) => Array.isArray(vector) && vector.length);
  if (!filtered.length) return [];
  const length = filtered[0].length;
  const sums = new Array(length).fill(0);
  filtered.forEach((vector) => {
    for (let index = 0; index < length; index += 1) sums[index] += vector[index] || 0;
  });
  return sums.map((value) => value / filtered.length);
}

function clipText(text, maxChars = 2200) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function mergePathLabel(prefix, label) {
  const left = String(prefix || "").trim();
  const right = String(label || "").trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} › ${right}`;
}

function makeRangeLabel(first, last) {
  const start = first?.displayLineStart || first?.displayLineNumber || first?.lineStart || first?.lineNumber || 0;
  const end = last?.displayLineEnd || last?.displayLineNumber || last?.lineEnd || last?.lineNumber || start;
  if (!start) return "Passage";
  return start === end ? `Line ${start}` : `Lines ${start}-${end}`;
}

function splitIntoSemanticSegments(items) {
  if (!Array.isArray(items) || items.length < 4) return [items];
  const splitCount = Math.min(items.length - 1, Math.max(1, Math.ceil(Math.sqrt(items.length)) - 1));
  const distances = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    const left = items[index];
    const right = items[index + 1];
    distances.push({
      afterIndex: index,
      distance: 1 - cosineBetweenVectors(left.vector || [], right.vector || []),
    });
  }
  const splitIndexes = distances
    .sort((a, b) => b.distance - a.distance)
    .slice(0, splitCount)
    .map((entry) => entry.afterIndex)
    .sort((a, b) => a - b);

  if (!splitIndexes.length) return [items];

  const segments = [];
  let start = 0;
  splitIndexes.forEach((splitIndex) => {
    const segment = items.slice(start, splitIndex + 1);
    if (segment.length) segments.push(segment);
    start = splitIndex + 1;
  });
  const tail = items.slice(start);
  if (tail.length) segments.push(tail);
  return segments.length ? segments : [items];
}

function withWorkMeta(work, node) {
  return {
    workId: work.workId || work.id,
    workSlug: work.workSlug || work.slug,
    workTitle: work.workTitle || work.title,
    category: work.category,
    variant: work.variant || "ps",
    sectionKey: "",
    parentNodeKey: "",
    nodeDepth: 0,
    nodeOrder: 0,
    pathLabel: "",
    vector: [],
    ...node,
  };
}

function nodeTextForEmbedding(node) {
  const prefix = [
    node.workTitle,
    node.pathLabel || node.label,
    node.locationLabel,
  ].filter(Boolean).join(" · ");
  return `${prefix}\n\n${node.chunkText || ""}`.trim();
}

function applyParenting(items, parentNode) {
  items.forEach((item, index) => {
    item.parentNodeKey = parentNode.nodeKey;
    item.nodeDepth = parentNode.nodeDepth + 1;
    item.nodeOrder = index;
    item.pathLabel = mergePathLabel(parentNode.pathLabel, item.label || item.pathLabel);
  });
}

function createClusterNodes(items, parentNode, collector, options) {
  const minChildren = options?.minChildren ?? 4;
  if (!items.length) return;
  if (items.length < minChildren) {
    applyParenting(items, parentNode);
    return;
  }

  const segments = splitIntoSemanticSegments(items);
  if (segments.length <= 1 || segments.length >= items.length) {
    applyParenting(items, parentNode);
    return;
  }

  segments.forEach((segment, segmentIndex) => {
    if (segment.length < 2) {
      applyParenting(segment, parentNode);
      return;
    }

    const first = segment[0];
    const last = segment[segment.length - 1];
    const label = makeRangeLabel(first, last);
    const clusterNode = withWorkMeta(first, {
      nodeType: options.clusterType,
      nodeKey: `${parentNode.nodeKey}::${options.clusterType}:${parentNode.nodeDepth + 1}:${segmentIndex}:${first.lineStart}-${last.lineEnd}`,
      sectionKey: first.sectionKey || "",
      label,
      locationLabel: first.locationLabel || parentNode.locationLabel || "",
      speaker: "",
      lineStart: first.lineStart,
      lineEnd: last.lineEnd,
      displayLineStart: first.displayLineStart || first.lineStart,
      displayLineEnd: last.displayLineEnd || last.lineEnd,
      startLineKey: first.startLineKey,
      endLineKey: last.endLineKey,
      chunkText: clipText(segment.map((item) => item.chunkText || "").filter(Boolean).join("\n\n"), options.maxTextChars || 2200),
      parentNodeKey: parentNode.nodeKey,
      nodeDepth: parentNode.nodeDepth + 1,
      nodeOrder: segmentIndex,
      pathLabel: mergePathLabel(parentNode.pathLabel, label),
      vector: averageVectors(segment.map((item) => item.vector)),
    });

    collector.push(clusterNode);
    createClusterNodes(segment, clusterNode, collector, options);
  });
}

function buildWorkTree(work, scaffold) {
  const rootNode = withWorkMeta(work, {
    ...scaffold.root,
    parentNodeKey: "",
    nodeDepth: 0,
    nodeOrder: 0,
    pathLabel: "",
  });
  const allNodes = [];
  const sectionNodes = [];

  scaffold.sections.forEach((section, sectionIndex) => {
    const sectionNode = withWorkMeta(work, {
      ...section,
      parentNodeKey: rootNode.nodeKey,
      nodeDepth: 1,
      nodeOrder: sectionIndex,
      pathLabel: section.label || "",
    });
    const passageNodes = (section.passages || []).map((passage, passageIndex) => withWorkMeta(work, {
      ...passage,
      nodeOrder: passageIndex,
      pathLabel: mergePathLabel(sectionNode.pathLabel, passage.label),
    }));
    sectionNode.vector = averageVectors(passageNodes.map((node) => node.vector));

    const nestedNodes = [];
    createClusterNodes(passageNodes, sectionNode, nestedNodes, {
      clusterType: "cluster",
      maxTextChars: 1800,
      minChildren: 4,
    });

    allNodes.push(sectionNode, ...nestedNodes, ...passageNodes);
    sectionNodes.push(sectionNode);
  });

  rootNode.vector = averageVectors(sectionNodes.map((node) => node.vector));
  const workClusters = [];
  createClusterNodes(sectionNodes, rootNode, workClusters, {
    clusterType: "work_cluster",
    maxTextChars: 2400,
    minChildren: 4,
  });

  return [rootNode, ...workClusters, ...allNodes];
}

function normalizeLegacySemanticNodeKeys(db) {
  db.prepare(`
    UPDATE semantic_search_chunks
    SET node_key = 'legacy:' || id
    WHERE TRIM(COALESCE(node_key, '')) = ''
  `).run();

  const duplicates = db.prepare(`
    SELECT node_key
    FROM semantic_search_chunks
    WHERE TRIM(COALESCE(node_key, '')) <> ''
    GROUP BY node_key
    HAVING COUNT(*) > 1
  `).all();

  const selectIds = db.prepare(`
    SELECT id
    FROM semantic_search_chunks
    WHERE node_key = ?
    ORDER BY id
  `);
  const updateKey = db.prepare(`
    UPDATE semantic_search_chunks
    SET node_key = ?
    WHERE id = ?
  `);

  duplicates.forEach(({ node_key: nodeKey }) => {
    const rows = selectIds.all(nodeKey);
    rows.slice(1).forEach(({ id }) => {
      updateKey.run(`${nodeKey}::legacy:${id}`, id);
    });
  });
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
      node_key TEXT DEFAULT '',
      parent_node_key TEXT DEFAULT '',
      node_depth INTEGER DEFAULT 0,
      node_order INTEGER DEFAULT 0,
      start_line_key TEXT DEFAULT '',
      end_line_key TEXT DEFAULT '',
      path_label TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const alterStatements = [
    "ALTER TABLE semantic_search_chunks ADD COLUMN node_key TEXT DEFAULT ''",
    "ALTER TABLE semantic_search_chunks ADD COLUMN parent_node_key TEXT DEFAULT ''",
    "ALTER TABLE semantic_search_chunks ADD COLUMN node_depth INTEGER DEFAULT 0",
    "ALTER TABLE semantic_search_chunks ADD COLUMN node_order INTEGER DEFAULT 0",
    "ALTER TABLE semantic_search_chunks ADD COLUMN start_line_key TEXT DEFAULT ''",
    "ALTER TABLE semantic_search_chunks ADD COLUMN end_line_key TEXT DEFAULT ''",
    "ALTER TABLE semantic_search_chunks ADD COLUMN path_label TEXT DEFAULT ''",
  ];
  alterStatements.forEach((statement) => {
    try { db.exec(statement); } catch {}
  });

  normalizeLegacySemanticNodeKeys(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_semantic_search_chunks_type
      ON semantic_search_chunks(chunk_type, work_slug, scope_key);
    CREATE INDEX IF NOT EXISTS idx_semantic_search_chunks_work
      ON semantic_search_chunks(work_id, chunk_type, line_start);
    CREATE INDEX IF NOT EXISTS idx_semantic_search_chunks_parent
      ON semantic_search_chunks(parent_node_key, node_order);
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_search_chunks_node_key
      ON semantic_search_chunks(node_key);
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

  const leafNodes = [];
  const workScaffolds = [];
  works.forEach((work) => {
    const scaffold = buildSemanticScaffoldForWork(work);
    if (!scaffold) return;
    workScaffolds.push({ work, scaffold });
    scaffold.sections.forEach((section) => {
      (section.passages || []).forEach((passage) => {
        leafNodes.push(withWorkMeta(work, passage));
      });
    });
  });

  const leafVectors = await embedTexts(
    leafNodes.map((node) => nodeTextForEmbedding(node)),
    { logger, inputType: "document" }
  );
  leafNodes.forEach((node, index) => {
    node.vector = leafVectors[index] || [];
  });

  const passagesByKey = new Map(leafNodes.map((node) => [node.nodeKey, node]));
  const allNodes = [];

  workScaffolds.forEach(({ work, scaffold }) => {
    scaffold.sections.forEach((section) => {
      section.passages = (section.passages || []).map((passage) => passagesByKey.get(passage.nodeKey)).filter(Boolean);
    });
    const nodes = buildWorkTree(work, scaffold).filter((node) => Array.isArray(node.vector) && node.vector.length);
    allNodes.push(...nodes);
  });

  const config = getSemanticEmbeddingConfig();
  const clearRows = db.prepare("DELETE FROM semantic_search_chunks");
  const insertRow = db.prepare(`
    INSERT INTO semantic_search_chunks (
      work_id, work_slug, work_title, category, variant,
      chunk_type, scope_key, label, location_label, speaker,
      line_start, line_end, display_line_start, display_line_end,
      chunk_text, embedding, embedding_norm, embedding_model, embedding_dimensions,
      node_key, parent_node_key, node_depth, node_order, start_line_key, end_line_key, path_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    clearRows.run();
    allNodes.forEach((node) => {
      insertRow.run(
        node.workId,
        node.workSlug,
        node.workTitle,
        node.category,
        node.variant || "ps",
        node.nodeType,
        node.sectionKey || "",
        node.label || "",
        node.locationLabel || "",
        node.speaker || "",
        node.lineStart,
        node.lineEnd,
        node.displayLineStart || node.lineStart,
        node.displayLineEnd || node.lineEnd,
        node.chunkText || "",
        packEmbedding(node.vector),
        vectorNorm(node.vector),
        config.model,
        config.dimensions,
        node.nodeKey,
        node.parentNodeKey || "",
        node.nodeDepth || 0,
        node.nodeOrder || 0,
        node.startLineKey || "",
        node.endLineKey || "",
        node.pathLabel || "",
      );
    });
  });

  transaction();
  return {
    available: true,
    skipped: false,
    works: workScaffolds.length,
    chunks: allNodes.length,
    dimensions: config.dimensions,
    model: config.model,
  };
}

module.exports = {
  SEMANTIC_INDEX_BUILD_VERSION,
  cosineSimilarity,
  ensureSemanticSearchSchema,
  getSemanticSearchStatus(db) {
    ensureSemanticSearchSchema(db);
    const chunkCount = Number(db.prepare("SELECT COUNT(*) AS count FROM semantic_search_chunks").get().count || 0);
    const rootCount = Number(db.prepare("SELECT COUNT(*) AS count FROM semantic_search_chunks WHERE chunk_type='work'").get().count || 0);
    const sample = db.prepare(`
      SELECT embedding_model AS model, embedding_dimensions AS dimensions
      FROM semantic_search_chunks
      ORDER BY id DESC
      LIMIT 1
    `).get() || {};
    return {
      configured: isSemanticEmbeddingConfigured(),
      indexed: chunkCount > 0 && rootCount > 0,
      chunkCount,
      model: sample.model || getSemanticEmbeddingConfig().model,
      dimensions: Number(sample.dimensions || getSemanticEmbeddingConfig().dimensions || 0),
    };
  },
  rebuildSemanticSearchIndex,
};
