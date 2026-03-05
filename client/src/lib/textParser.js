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

  root.querySelectorAll("sonnet").forEach(sonnet => {
    const num = sonnet.getAttribute("num") || "";
    const lines = [];

    sonnet.querySelectorAll("l, line").forEach(l => {
      const n = l.getAttribute("n") || "";
      lines.push({ text: txt(l), n: parseInt(n, 10) || (lines.length + 1) });
    });

    if (lines.length > 0) {
      sections.push({ title: `Sonnet ${num || sections.length + 1}`, heading: num, sectionType: "sonnet", lines });
    }
  });

  return { type: "poetry", title, sections };
}

/* ── Parse poems (Venus and Adonis, Lucrece, Phoenix & Turtle, etc.) ── */
function parsePoem(root, title) {
  const sections = [];

  // Try stanza-based structure
  const stanzas = root.querySelectorAll("stanza, stanzasmall");
  if (stanzas.length > 0) {
    stanzas.forEach((st, idx) => {
      const num = st.querySelector("stanzanum");
      const heading = num ? txt(num) : "";
      const lines = [];
      let localN = 0;
      st.querySelectorAll("l, line").forEach(l => {
        localN++;
        const n = l.getAttribute("n");
        lines.push({ text: txt(l), n: parseInt(n, 10) || localN });
      });
      if (lines.length) sections.push({ title: heading, heading, sectionType: "stanza", lines });
    });
    return { type: "poetry", title, sections };
  }

  // Try lg (line group) based — but NOT nested inside sonnets (those are handled above)
  const lgs = root.querySelectorAll("poembody > lg, poembody > stanza");
  if (lgs.length > 0) {
    lgs.forEach((lg, idx) => {
      const lines = [];
      let localN = 0;
      lg.querySelectorAll("l, line").forEach(l => {
        localN++;
        const n = l.getAttribute("n");
        lines.push({ text: txt(l), n: parseInt(n, 10) || localN });
      });
      if (lines.length) sections.push({ title: "", heading: "", sectionType: "stanza", lines });
    });
    return { type: "poetry", title, sections };
  }

  // Fallback: grab all lines, split on gaps
  const allLines = [];
  root.querySelectorAll("l, line").forEach(l => {
    const n = l.getAttribute("n");
    allLines.push({ text: txt(l), n: parseInt(n, 10) || (allLines.length + 1) });
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

  return { type: "poetry", title, sections: sections.length > 0 ? sections : [{ title: "", heading: "", sectionType: "stanza", lines: [{ text: "No content found.", n: 1 }] }] };
}
