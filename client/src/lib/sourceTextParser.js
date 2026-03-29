const BLOCK_TAGS = new Set([
  "argument",
  "byline",
  "closer",
  "dateline",
  "epigraph",
  "item",
  "opener",
  "p",
  "q",
  "quote",
  "salute",
  "signed",
  "trailer",
]);

const DIV_TAGS = new Set(["div", "div1", "div2", "div3", "div4", "div5"]);
const DECORATIVE_INITIAL_RE = /decorinit/i;
const SKIP_TAGS = new Set([
  "cb",
  "desc",
  "figure",
  "figdesc",
  "fw",
  "note",
  "pb",
  "ref",
]);

const G_REF_TEXT = {
  "char:EOLhyphen": "",
  "char:abque": "que",
  "char:cmbAbbrStroke": "",
  "char:punc": "▪",
  "char:V": "V",
  "char:v": "v",
};

function localName(node) {
  return String(node?.localName || node?.nodeName || "")
    .replace(/^.*:/, "")
    .toLowerCase();
}

function directChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child?.nodeType === 1);
}

function cleanupText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\s+'/g, "'")
    .trim();
}

function normalizeForComparison(text) {
  return cleanupText(String(text || ""))
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isDecorativeInitialNode(node) {
  if (!node || node.nodeType !== 1) return false;
  return DECORATIVE_INITIAL_RE.test(
    `${node.getAttribute?.("rend") || ""} ${node.getAttribute?.("type") || ""}`,
  );
}

function textFromNode(node, options = {}) {
  if (!node) return "";
  if (node.nodeType === 3) return node.nodeValue || "";
  if (node.nodeType !== 1) return "";

  const tag = localName(node);
  if (!tag || SKIP_TAGS.has(tag)) return "";
  if (options.skipDecorativeInitial && isDecorativeInitialNode(node)) return "";
  if (tag === "gap") return "…";
  if (tag === "g") return node.textContent || G_REF_TEXT[node.getAttribute("ref")] || "";
  if (tag === "choice") {
    const preferred = directChildren(node).find((child) => {
      const childTag = localName(child);
      return childTag === "reg" || childTag === "corr" || childTag === "expan";
    });
    return textFromNode(preferred || directChildren(node)[0], options);
  }
  if (tag === "lb") return " ";

  const parts = Array.from(node.childNodes || []).map((child) => textFromNode(child, options));
  return cleanupText(parts.join(" "));
}

function findLeadingDecorativeInitial(node) {
  for (const child of Array.from(node?.childNodes || [])) {
    if (child?.nodeType === 3) {
      if ((child.nodeValue || "").trim()) return null;
      continue;
    }

    if (child?.nodeType !== 1) continue;

    const tag = localName(child);
    if (!tag || SKIP_TAGS.has(tag) || tag === "lb" || tag === "pb" || tag === "cb") {
      continue;
    }

    if (isDecorativeInitialNode(child)) {
      const text = cleanupText(textFromNode(child));
      return text ? text.charAt(0) : null;
    }

    const nestedInitial = findLeadingDecorativeInitial(child);
    if (nestedInitial !== undefined) return nestedInitial;

    if (cleanupText(textFromNode(child))) return null;
  }

  return undefined;
}

function extractDecorativeInitial(node) {
  const result = findLeadingDecorativeInitial(node);
  return typeof result === "string" ? result : "";
}

function normalizeDecorativeContinuation(text) {
  const value = String(text || "");
  if (!value) return value;

  const prefixMatch = value.match(/^[^A-Za-zÀ-ÖØ-öø-ÿƲ]+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const remainder = value.slice(prefix.length);
  const tokenMatch = remainder.match(/^[A-Za-zÀ-ÖØ-öø-ÿƲ]+/);
  if (!tokenMatch) return value;

  const token = tokenMatch[0];
  let replacement = token;

  if (token.length === 1) {
    replacement = token.toLowerCase();
  } else if (token.length <= 3 && token === token.toUpperCase()) {
    replacement = token.toLowerCase();
  } else if (token[1] && token[1] === token[1].toLowerCase()) {
    replacement = token[0].toLowerCase() + token.slice(1);
  } else if (
    token.length >= 3
    && token[0] === token[0].toUpperCase()
    && token[1] === token[1].toUpperCase()
    && token[2] === token[2].toLowerCase()
  ) {
    replacement = token.slice(0, 2).toLowerCase() + token.slice(2);
  }

  return prefix + replacement + remainder.slice(token.length);
}

function prettifyLabel(value) {
  const raw = cleanupText(String(value || "").replace(/[_-]+/g, " "));
  if (!raw) return "";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

function descendantsByLocalName(node, name) {
  return Array.from(node?.getElementsByTagName("*") || [])
    .filter((child) => localName(child) === String(name || "").toLowerCase());
}

function collectVerseLines(node) {
  const direct = directChildren(node).filter((child) => localName(child) === "l");
  const lineNodes = direct.length ? direct : descendantsByLocalName(node, "l");
  return lineNodes
    .map((lineNode) => {
      const decorativeInitial = extractDecorativeInitial(lineNode);
      const text = decorativeInitial
        ? normalizeDecorativeContinuation(textFromNode(lineNode, { skipDecorativeInitial: true }))
        : textFromNode(lineNode);
      if (!text && !decorativeInitial) return null;
      return { text, decorativeInitial };
    })
    .filter(Boolean);
}

function extractListItems(node) {
  const items = directChildren(node).filter((child) => localName(child) === "item");
  return items.map((item) => textFromNode(item)).filter(Boolean);
}

function extractSpeech(node) {
  const speakerNode = directChildren(node).find((child) => localName(child) === "speaker");
  const speaker = textFromNode(speakerNode);
  const blocks = extractBlocks(directChildren(node).filter((child) => localName(child) !== "speaker"));
  if (!speaker && !blocks.length) return null;
  return { type: "speech", speaker, blocks };
}

function applyDecorativeInitialToBlock(block, decorativeInitial) {
  if (!block || !decorativeInitial) return block;

  if (block.type === "paragraph" && !block.decorativeInitial) {
    return { ...block, decorativeInitial };
  }

  if (block.type === "verse" && Array.isArray(block.lines) && block.lines.length) {
    const firstLine = block.lines[0];
    if (typeof firstLine === "string") {
      return {
        ...block,
        lines: [{ text: firstLine, decorativeInitial }, ...block.lines.slice(1)],
      };
    }
    if (!firstLine?.decorativeInitial) {
      return {
        ...block,
        lines: [{ ...firstLine, decorativeInitial }, ...block.lines.slice(1)],
      };
    }
  }

  return block;
}

function postProcessBlocks(blocks, heading = "", partLabel = "") {
  if (!blocks.length) return blocks;

  const mergedBlocks = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const decorativeOnly = block?.type === "paragraph" && block.decorativeInitial && !cleanupText(block.text);
    if (decorativeOnly) {
      const nextBlock = blocks[index + 1];
      if (nextBlock) {
        mergedBlocks.push(applyDecorativeInitialToBlock(nextBlock, block.decorativeInitial));
        index += 1;
        continue;
      }
    }
    mergedBlocks.push(block);
  }

  const trimmedBlocks = [...mergedBlocks];
  const comparisonTargets = [heading, partLabel].map(normalizeForComparison).filter(Boolean);
  while (
    trimmedBlocks.length > 1
    && trimmedBlocks[0]?.type === "paragraph"
    && comparisonTargets.includes(normalizeForComparison(trimmedBlocks[0].text))
  ) {
    trimmedBlocks.shift();
  }

  return trimmedBlocks;
}

function extractBlocks(nodes) {
  const blocks = [];
  let looseLines = [];

  const flushLooseLines = () => {
    if (!looseLines.length) return;
    blocks.push({ type: "verse", lines: looseLines });
    looseLines = [];
  };

  for (const node of nodes || []) {
    const tag = localName(node);
    if (!tag || DIV_TAGS.has(tag) || tag === "head" || tag === "pb" || tag === "cb") continue;

    if (tag === "l") {
      const decorativeInitial = extractDecorativeInitial(node);
      const text = decorativeInitial
        ? normalizeDecorativeContinuation(textFromNode(node, { skipDecorativeInitial: true }))
        : textFromNode(node);
      if (text || decorativeInitial) looseLines.push({ text, decorativeInitial });
      continue;
    }

    flushLooseLines();

    if (tag === "lg") {
      const lines = collectVerseLines(node);
      if (lines.length) blocks.push({ type: "verse", lines });
      continue;
    }

    if (tag === "list") {
      const items = extractListItems(node);
      if (items.length) blocks.push({ type: "list", items });
      continue;
    }

    if (tag === "sp") {
      const speech = extractSpeech(node);
      if (speech) blocks.push(speech);
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      const decorativeInitial = extractDecorativeInitial(node);
      const text = decorativeInitial
        ? normalizeDecorativeContinuation(textFromNode(node, { skipDecorativeInitial: true }))
        : textFromNode(node);
      if (text || decorativeInitial) blocks.push({ type: "paragraph", text, decorativeInitial });
      continue;
    }

    const decorativeInitial = extractDecorativeInitial(node);
    const text = decorativeInitial
      ? normalizeDecorativeContinuation(textFromNode(node, { skipDecorativeInitial: true }))
      : textFromNode(node);
    if (text || decorativeInitial) blocks.push({ type: "paragraph", text, decorativeInitial });
  }

  flushLooseLines();
  return blocks;
}

function headingForNode(node, fallback = "") {
  const headNodes = directChildren(node).filter((child) => localName(child) === "head");
  const heading = headNodes.map((child) => textFromNode(child)).filter(Boolean).join(" — ");
  if (heading) return heading;
  const type = node.getAttribute("type") || node.getAttribute("subtype") || "";
  return fallback || prettifyLabel(type || localName(node));
}

function pushSection(sections, partLabel, path, blocks, hasChildDivs = false) {
  if (!blocks.length) return;
  const displayPath = [partLabel, ...path].filter(Boolean);
  const heading = path[path.length - 1] || partLabel || "";
  const processedBlocks = postProcessBlocks(blocks, heading, partLabel);
  if (!processedBlocks.length) return;
  if (hasChildDivs) {
    const texts = processedBlocks
      .filter((block) => block?.type === "paragraph")
      .map((block) => normalizeForComparison(block.text))
      .filter(Boolean);
    const headingValue = normalizeForComparison(heading);
    const partValue = normalizeForComparison(partLabel);
    const looksLikeShell = texts.length > 0 && texts.every((text) => (
      text === headingValue
      || text === partValue
      || /^the end of /.test(text)
    ));
    if (looksLikeShell) return;
  }
  sections.push({
    key: displayPath.join(" / ").toLowerCase().replace(/[^a-z0-9]+/g, "-") || `section-${sections.length + 1}`,
    title: path[path.length - 1] || partLabel || `Section ${sections.length + 1}`,
    path: displayPath,
    blocks: processedBlocks,
  });
}

function processDiv(node, sections, partLabel, ancestry = []) {
  const heading = headingForNode(node);
  const nextPath = heading ? [...ancestry, heading] : ancestry;
  const children = directChildren(node);
  const divChildren = children.filter((child) => DIV_TAGS.has(localName(child)));
  const nonDivChildren = children.filter((child) => !DIV_TAGS.has(localName(child)));
  const blocks = extractBlocks(nonDivChildren);
  pushSection(sections, partLabel, nextPath, blocks, divChildren.length > 0);

  divChildren.forEach((child) => processDiv(child, sections, partLabel, nextPath));
}

function collectTextNodes(root) {
  return Array.from(root.getElementsByTagName("*"))
    .filter((node) => localName(node) === "text")
    .filter((node) => directChildren(node).some((child) => {
      const tag = localName(child);
      return tag === "front" || tag === "body" || tag === "back" || DIV_TAGS.has(tag);
    }));
}

function extractPartSections(node, partLabel, sections) {
  const children = directChildren(node);
  const divChildren = children.filter((child) => DIV_TAGS.has(localName(child)));
  const nonDivChildren = children.filter((child) => !DIV_TAGS.has(localName(child)) && localName(child) !== "head");
  const heading = headingForNode(node, partLabel);

  const blocks = extractBlocks(nonDivChildren);
  pushSection(sections, partLabel, heading && heading !== partLabel ? [heading] : [], blocks, divChildren.length > 0);
  divChildren.forEach((child) => processDiv(child, sections, partLabel, []));
}

function titleFromXml(root) {
  const titles = Array.from(root.getElementsByTagName("*"))
    .filter((node) => localName(node) === "title")
    .map((node) => textFromNode(node))
    .filter(Boolean);
  return titles[0] || "Source Text";
}

export function parseSourceTextXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    return {
      title: "Source Text",
      sections: [{
        key: "error",
        title: "Parse Error",
        path: ["Parse Error"],
        blocks: [{ type: "paragraph", text: "This EEBO-TCP file could not be parsed in the browser." }],
      }],
    };
  }

  const root = doc.documentElement;
  const textNodes = collectTextNodes(root);
  const sections = [];

  (textNodes.length ? textNodes : [root]).forEach((textNode) => {
    const partNodes = directChildren(textNode).filter((child) => {
      const tag = localName(child);
      return tag === "front" || tag === "body" || tag === "back";
    });
    if (!partNodes.length) {
      const blocks = extractBlocks(directChildren(textNode));
      pushSection(sections, "", [], blocks);
      return;
    }
    partNodes.forEach((partNode) => {
      const tag = localName(partNode);
      const partLabel = prettifyLabel(tag);
      extractPartSections(partNode, partLabel, sections);
    });
  });

  return {
    title: titleFromXml(root),
    sections: sections.length ? sections : [{
      key: "empty",
      title: "Empty Text",
      path: ["Empty Text"],
      blocks: [{ type: "paragraph", text: "No readable content was found in this source text." }],
    }],
  };
}
