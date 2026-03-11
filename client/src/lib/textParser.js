/**
 * Parses PlayShakespeare XML content.
 *
 * Play structure:  <play> → <act> → <scene> → <sp> → <speaker> + <l>
 * Poem structure:  <poem> → <sonnets> → <sonnet> → <lg> → <l>
 *                  <poem> → <poembody> → <stanza> → <l>
 *
 * Stage directions: <stage> (standalone) or <stagedir> → <dir>/<action>
 * Cast: <castList>/<personae> → <castItem>/<persona> → <role>/<persname>
 */

export function parsePlayShakespeareXML(xmlString, title, category) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  const root = doc.documentElement;

  if (!root || root.nodeName === "parsererror") {
    // Try as HTML fallback
    const hdoc = new DOMParser().parseFromString(xmlString, "text/html");
    return { type: "play", title, personae: [], lines: [{ type: "speech", speaker: "", lines: [{ type: "line", text: "Error parsing XML content." }] }] };
  }

  const rootTag = root.tagName.toLowerCase();

  // Sonnets
  if (root.querySelector("sonnets")) {
    return parseSonnets(root, title);
  }

  // Poems (non-sonnet)
  if (rootTag === "poem") {
    return parsePoem(root, title);
  }

  // Plays
  return parsePlay(root, title);
}

/* ── Extract clean text from a node, resolving entities ── */
function txt(node) {
  if (!node) return "";
  let s = node.textContent.replace(/\s+/g, " ").trim();
  // Safety: decode any remaining numeric HTML entities the parser missed
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  // Remove stray PUA characters (Folger long-s &#57348; etc.)
  s = s.replace(/[\uE000-\uF8FF]/g, "");
  return s;
}

function parseLineN(node) {
  const raw = node?.getAttribute?.("gn") || node?.getAttribute?.("n");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseLineKey(node, fallback) {
  return node?.getAttribute?.("id")
    || node?.getAttribute?.("xml:id")
    || fallback;
}

function directChildren(node) {
  return Array.from(node?.children || []);
}

const FRONT_MATTER_BODY_TAGS = new Set(["poembody", "body", "sonnets", "stanza", "stanzasmall", "lg"]);
const FRONT_MATTER_METADATA_TAGS = new Set([
  "author",
  "authors",
  "meta",
  "metadata",
  "imprint",
  "pubdate",
  "date",
  "titlestmt",
  "filedesc",
  "publicationstmt",
  "editionstmt",
  "availability",
  "publisher",
  "email",
  "name",
]);

function inferFrontMatterKind(label) {
  const text = String(label || "").trim().toLowerCase();
  if (!text) return "frontmatter";
  if (text.includes("argument")) return "argument";
  if (text.includes("dedicat")) return "dedication";
  if (text.startsWith("to ") || text.includes("right honourable") || text.includes("right honorable")) return "dedication";
  return "frontmatter";
}

function normalizeFrontMatterTitle(title, kind) {
  if (title) return title;
  if (kind === "dedication") return "Dedication";
  if (kind === "argument") return "Argument";
  return "Front Matter";
}

function extractBlocksFromFrontMatterNode(sectionNode) {
  const looseLines = [];
  const blocks = [];

  directChildren(sectionNode).forEach((child) => {
    const tag = child?.tagName?.toLowerCase();
    if (!tag || tag === "title" || tag === "head" || tag === "dedicationtitle" || tag === "argumenttitle") return;

    if (tag === "p" || tag === "para" || tag === "salute" || tag === "signed") {
      const text = txt(child);
      if (text) blocks.push({ type: "paragraph", text });
      return;
    }

    if (tag === "lg" || tag === "stanza" || tag === "stanzasmall") {
      const lines = directChildren(child)
        .filter((lineNode) => {
          const lineTag = lineNode?.tagName?.toLowerCase();
          return lineTag === "l" || lineTag === "line";
        })
        .map((lineNode) => txt(lineNode))
        .filter(Boolean);
      if (lines.length) blocks.push({ type: "lines", lines });
      return;
    }

    if (tag === "l" || tag === "line") {
      const text = txt(child);
      if (text) looseLines.push(text);
      return;
    }

    const fallbackText = txt(child);
    if (fallbackText) blocks.push({ type: "paragraph", text: fallbackText });
  });

  if (looseLines.length) {
    blocks.push({ type: "lines", lines: looseLines });
  }

  if (!blocks.length) {
    const cleaned = txt(sectionNode);
    if (cleaned) blocks.push({ type: "paragraph", text: cleaned });
  }

  return blocks;
}

function extractFrontMatterSection(sectionNode, fallbackTitle) {
  if (!sectionNode) return null;

  const titleNode = directChildren(sectionNode).find((child) => {
    const tag = child?.tagName?.toLowerCase();
    if (tag === "title" && child.getAttribute?.("type")) return false;
    return tag === "title" || tag === "head" || tag === "dedicationtitle" || tag === "argumenttitle";
  });

  const blocks = extractBlocksFromFrontMatterNode(sectionNode);
  if (!blocks.length) return null;

  const title = txt(titleNode) || fallbackTitle;
  const kind = inferFrontMatterKind(sectionNode.tagName?.toLowerCase() || title || fallbackTitle);
  return {
    kind,
    title: normalizeFrontMatterTitle(title, kind),
    blocks,
  };
}

function extractGenericFrontMatter(children) {
  const sections = [];
  let currentTitle = "";
  let currentKind = "frontmatter";
  let currentBlocks = [];

  const flushCurrent = () => {
    if (!currentBlocks.length) return;
    sections.push({
      kind: currentKind,
      title: normalizeFrontMatterTitle(currentTitle, currentKind),
      blocks: currentBlocks,
    });
    currentTitle = "";
    currentKind = "frontmatter";
    currentBlocks = [];
  };

  const addSection = (child, fallbackTitle) => {
    flushCurrent();
    const section = extractFrontMatterSection(child, fallbackTitle);
    if (section) sections.push(section);
  };

  children.forEach((child) => {
    const tag = child?.tagName?.toLowerCase();
    if (!tag) return;

    if (FRONT_MATTER_METADATA_TAGS.has(tag)) return;

    if (tag === "dedication" || tag === "argument") {
      addSection(child, tag === "dedication" ? "Dedication" : "Argument");
      return;
    }

    if (tag === "front" || tag === "poemintro") {
      flushCurrent();
      sections.push(...extractGenericFrontMatter(directChildren(child)));
      return;
    }

    if (tag === "head" || tag === "subtitle" || (tag === "title" && !child.getAttribute?.("type"))) {
      const heading = txt(child);
      if (!heading) return;
      flushCurrent();
      currentTitle = heading;
      currentKind = inferFrontMatterKind(heading);
      return;
    }

    if (FRONT_MATTER_BODY_TAGS.has(tag)) {
      return;
    }

    const blocks = extractBlocksFromFrontMatterNode(child);
    if (!blocks.length) return;
    currentBlocks.push(...blocks);
  });

  flushCurrent();
  return sections.filter((section) => section.blocks?.length);
}

function extractPoembodyFrontMatter(root) {
  const poembody = directChildren(root).find((child) => child?.tagName?.toLowerCase() === "poembody");
  if (!poembody) return [];

  const children = directChildren(poembody);
  if (!children.length) return [];

  const hasArgumentLead = children.some((child) => {
    const tag = child?.tagName?.toLowerCase();
    if (tag === "subtitle") return /argument/i.test(txt(child));
    if (tag === "l" || tag === "line") return String(child.getAttribute?.("type") || "").toLowerCase() === "argument";
    return false;
  });
  if (!hasArgumentLead) return [];

  const leadingChildren = [];
  for (const child of children) {
    const tag = child?.tagName?.toLowerCase();
    if (tag === "lg" || tag === "stanza" || tag === "stanzasmall") break;
    leadingChildren.push(child);
  }

  return extractGenericFrontMatter(leadingChildren);
}

function extractPoemFrontMatter(root) {
  const leadingChildren = [];
  for (const child of directChildren(root)) {
    const tag = child?.tagName?.toLowerCase();
    if (!tag) continue;
    if (FRONT_MATTER_BODY_TAGS.has(tag)) break;
    leadingChildren.push(child);
  }

  const sections = [
    ...extractGenericFrontMatter(leadingChildren),
    ...extractPoembodyFrontMatter(root),
  ];
  if (!sections.length) return [];

  return sections;
}

/* ── Extract personae/cast from various formats ── */
function extractCast(root) {
  const personae = [];

  // <castList> → <castItem> → <role>
  root.querySelectorAll("castList > castItem, castList castItem").forEach(ci => {
    const role = ci.querySelector("role");
    const desc = ci.querySelector("roleDesc");
    const shortName = role?.getAttribute("short") || "";
    const longName = txt(role) || shortName;
    const descText = desc ? txt(desc) : "";
    const gender = ci.getAttribute("gender") || "";
    personae.push({ name: longName, short: shortName, desc: descText, gender });
  });

  // <personae> → <persona> → <persname>
  root.querySelectorAll("personae > persona, personae persona").forEach(p => {
    const pn = p.querySelector("persname");
    const desc = p.querySelector("persdescription");
    const shortName = pn?.getAttribute("short") || "";
    const longName = txt(pn) || shortName;
    const descText = desc ? txt(desc).replace(/\s+/g, " ") : "";
    const gender = p.getAttribute("gender") || "";
    personae.push({ name: longName, short: shortName, desc: descText, gender });
  });

  return personae;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function renderDramatis(personae) {
  if (!personae?.length) return "";
  const items = personae.map((p) => {
    const desc = p.desc ? ` <span style="color:var(--text-light);font-size:0.95em">(${escapeHtml(p.desc)})</span>` : "";
    return `<div style="break-inside:avoid;margin-bottom:8px;line-height:1.55"><span style="color:var(--accent);font-weight:600">${escapeHtml(p.name || "")}</span>${desc}</div>`;
  }).join("");
  return `<div style="column-width:240px;column-gap:28px;font-family:var(--font-body);font-style:normal">${items}</div>`;
}

/* ── Parse a play ── */
function parsePlay(root, title) {
  const personae = extractCast(root);
  const result = [];

  // Build a speaker lookup: short → long name
  const speakerMap = {};
  personae.forEach(p => {
    if (p.short) speakerMap[p.short.toUpperCase().replace(/\.$/, "")] = p.name;
  });

  function resolveSpeaker(speakerEl) {
    const long = speakerEl?.getAttribute("long");
    if (long) return long;
    const short = speakerEl?.getAttribute("short") || txt(speakerEl);
    // Try to find long name from cast
    const key = short.toUpperCase().replace(/\.$/, "").trim();
    return speakerMap[key] || short;
  }

  const actNodes = Array.from(root.children).filter((child) => {
    const tag = child?.tagName?.toLowerCase();
    return tag === "act" || tag === "actref";
  });

  actNodes.forEach(act => {
    const actNum = act.getAttribute("num");
    const actTitle = act.querySelector("acttitle");
    result.push({ type: "act", text: actTitle ? txt(actTitle) : `Act ${actNum}` });

    act.querySelectorAll(":scope > scene, :scope > sceneref, :scope > prologue, :scope > epilogue").forEach(scene => {
      const sceneTag = scene.tagName.toLowerCase();
      const sceneNum = scene.getAttribute("num");
      const sceneTitle = scene.querySelector("scenetitle");
      const sceneLoc = scene.querySelector("scenelocation");

      if (sceneTag === "prologue") {
        result.push({ type: "scene", text: "Prologue" });
      } else if (sceneTag === "epilogue") {
        result.push({ type: "scene", text: "Epilogue" });
      } else {
        result.push({ type: "scene", text: sceneTitle ? txt(sceneTitle) : `Scene ${sceneNum}` });
      }

      if (sceneLoc) {
        result.push({ type: "stagedir", text: txt(sceneLoc) });
      }

      // Process scene children in document order
      for (const child of scene.children) {
        const tag = child.tagName.toLowerCase();

        if (tag === "sp" || tag === "speech" || tag === "song") {
          const speaker = child.querySelector("speaker");
          const speakerName = resolveSpeaker(speaker);
          const lines = [];

          for (const lc of child.children) {
            const lt = lc.tagName.toLowerCase();
            if (lt === "l" || lt === "line") {
              lines.push({
                type: "line",
                text: txt(lc),
                form: lc.getAttribute("form") || "verse",
                n: parseLineN(lc),
              });
            } else if (lt === "stage") {
              lines.push({ type: "stagedir", text: txt(lc) });
            } else if (lt === "stagedir") {
              const dir = lc.querySelector("dir");
              lines.push({ type: "stagedir", text: dir ? txt(dir) : txt(lc) });
            } else if (lt === "recite") {
              // Character reading/reciting
              lc.querySelectorAll("l, line").forEach(rl => {
                lines.push({ type: "line", text: txt(rl), form: "recite", n: parseLineN(rl) });
              });
            }
          }

          if (speakerName || lines.length) {
            result.push({ type: "speech", speaker: speakerName, lines });
          }
        } else if (tag === "stage") {
          result.push({ type: "stagedir", text: txt(child) });
        } else if (tag === "stagedir") {
          const dir = child.querySelector("dir");
          result.push({ type: "stagedir", text: dir ? txt(dir) : txt(child) });
        }
      }
    });
  });

  return { type: "play", title, personae, dramatis: renderDramatis(personae), lines: result };
}

/* ── Parse sonnets ── */
function parseSonnets(root, title) {
  const sections = [];
  const frontMatter = extractPoemFrontMatter(root);

  root.querySelectorAll("sonnet").forEach((sonnet, sonnetIndex) => {
    const num = sonnet.getAttribute("num") || "";
    const lines = [];

    sonnet.querySelectorAll("l, line").forEach((l, lineIndex) => {
      const n = l.getAttribute("n") || "";
      lines.push({
        text: txt(l),
        n: parseInt(n, 10) || (lines.length + 1),
        lineKey: parseLineKey(l, `p-${sonnetIndex}-${lineIndex}`),
      });
    });

    if (lines.length > 0) {
      sections.push({ title: `Sonnet ${num || sections.length + 1}`, heading: num, sectionType: "sonnet", lines });
    }
  });

  return { type: "poetry", title, frontMatter, sections };
}

/* ── Parse poems (Venus and Adonis, Lucrece, Phoenix & Turtle, etc.) ── */
function parsePoem(root, title) {
  const sections = [];
  const frontMatter = extractPoemFrontMatter(root);

  // Try stanza-based structure
  const stanzas = root.querySelectorAll("stanza, stanzasmall");
  if (stanzas.length > 0) {
    stanzas.forEach((st, idx) => {
      const num = st.querySelector("stanzanum");
      const heading = num ? txt(num) : "";
      const lines = [];
      let localN = 0;
      st.querySelectorAll("l, line").forEach((l, lineIndex) => {
        localN++;
        const n = l.getAttribute("n");
        lines.push({
          text: txt(l),
          n: parseInt(n, 10) || localN,
          lineKey: parseLineKey(l, `p-${idx}-${lineIndex}`),
        });
      });
      if (lines.length) sections.push({ title: heading, heading, sectionType: "stanza", lines });
    });
    return { type: "poetry", title, frontMatter, sections };
  }

  // Try lg (line group) based — but NOT nested inside sonnets (those are handled above)
  const lgs = root.querySelectorAll("poembody > lg, poembody > stanza");
  if (lgs.length > 0) {
    lgs.forEach((lg, idx) => {
      const lines = [];
      let localN = 0;
      lg.querySelectorAll("l, line").forEach((l, lineIndex) => {
        localN++;
        const n = l.getAttribute("n");
        lines.push({
          text: txt(l),
          n: parseInt(n, 10) || localN,
          lineKey: parseLineKey(l, `p-${idx}-${lineIndex}`),
        });
      });
      if (lines.length) sections.push({ title: "", heading: "", sectionType: "stanza", lines });
    });
    return { type: "poetry", title, frontMatter, sections };
  }

  // Fallback: grab all lines, split on gaps
  const allLines = [];
  root.querySelectorAll("l, line").forEach((l, lineIndex) => {
    const n = l.getAttribute("n");
    allLines.push({
      text: txt(l),
      n: parseInt(n, 10) || (allLines.length + 1),
      lineKey: parseLineKey(l, `p-0-${lineIndex}`),
    });
  });
  if (allLines.length > 0) {
    const chunk = [];
    let cur = [];
    for (const line of allLines) {
      if (!line.text && cur.length > 0) { chunk.push(cur); cur = []; }
      else if (line.text) cur.push(line);
    }
    if (cur.length) chunk.push(cur);

    chunk.forEach((lines) => {
      sections.push({ title: "", heading: "", sectionType: "stanza", lines });
    });
  }

  return {
    type: "poetry",
    title,
    frontMatter,
    sections: sections.length > 0 ? sections : [{ title: "", heading: "", sectionType: "stanza", lines: [{ text: "No content found.", n: 1 }] }],
  };
}
