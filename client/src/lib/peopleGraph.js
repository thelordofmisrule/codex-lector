function textOf(node) {
  if (!node) return "";
  let value = node.textContent.replace(/\s+/g, " ").trim();
  value = value.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  value = value.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return value.replace(/[\uE000-\uF8FF]/g, "");
}

function parseLineNumber(node) {
  const raw = node?.getAttribute?.("gn") || node?.getAttribute?.("n");
  if (!raw) return null;
  const value = parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/&#(\d+);/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, " ")
    .replace(/['’`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value, fallback = "person") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function extractCast(root) {
  const personae = [];

  root.querySelectorAll("castList > castItem, castList castItem").forEach((item) => {
    const role = item.querySelector("role");
    const desc = item.querySelector("roleDesc");
    const shortName = role?.getAttribute("short") || "";
    const longName = textOf(role) || shortName;
    personae.push({
      name: longName,
      short: shortName,
      desc: desc ? textOf(desc) : "",
      gender: item.getAttribute("gender") || "",
    });
  });

  root.querySelectorAll("personae > persona, personae persona").forEach((item) => {
    const nameEl = item.querySelector("persname");
    const desc = item.querySelector("persdescription");
    const shortName = nameEl?.getAttribute("short") || "";
    const longName = textOf(nameEl) || shortName;
    personae.push({
      name: longName,
      short: shortName,
      desc: desc ? textOf(desc) : "",
      gender: item.getAttribute("gender") || "",
    });
  });

  return personae;
}

function createCharacterRegistry(personae) {
  const byId = new Map();
  const byKey = new Map();
  const stageAliases = [];

  function registerAliases(entry, rawValues) {
    const aliases = [...new Set(rawValues.map((value) => normalizeKey(value)).filter(Boolean))];
    entry.aliases = [...new Set([...(entry.aliases || []), ...aliases])];
    aliases.forEach((alias) => {
      if (!byKey.has(alias)) byKey.set(alias, entry);
      if (alias.length >= 3) {
        stageAliases.push({ alias, id: entry.id });
      }
    });
  }

  function upsert(raw) {
    const primaryName = String(raw?.name || raw?.short || "").trim();
    const lookupKey = normalizeKey(primaryName);
    if (lookupKey && byKey.has(lookupKey)) {
      const existing = byKey.get(lookupKey);
      if (!existing.desc && raw?.desc) existing.desc = raw.desc;
      if (!existing.short && raw?.short) existing.short = raw.short;
      return existing;
    }

    const baseId = slugify(primaryName, `person-${byId.size + 1}`);
    let id = baseId;
    let suffix = 2;
    while (byId.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const entry = {
      id,
      name: primaryName || `Person ${byId.size + 1}`,
      short: String(raw?.short || "").trim(),
      desc: String(raw?.desc || "").trim(),
      gender: String(raw?.gender || "").trim(),
      inferred: !!raw?.inferred,
      aliases: [],
    };

    byId.set(entry.id, entry);
    registerAliases(entry, [entry.name, entry.short]);
    return entry;
  }

  personae.forEach((person) => upsert(person));

  stageAliases.sort((a, b) => b.alias.length - a.alias.length);

  function resolveSpeaker(rawSpeaker) {
    const key = normalizeKey(rawSpeaker);
    if (!key) return null;
    if (byKey.has(key)) return byKey.get(key);
    return upsert({ name: rawSpeaker, inferred: true });
  }

  function detectInStageDirection(text) {
    const haystack = ` ${normalizeKey(text)} `;
    const ids = new Set();
    stageAliases.forEach((candidate) => {
      if (haystack.includes(` ${candidate.alias} `)) ids.add(candidate.id);
    });
    return [...ids];
  }

  return {
    getAll: () => [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
    resolveSpeaker,
    detectInStageDirection,
  };
}

function collectSceneChildren(parent) {
  return Array.from(parent?.children || []).filter((child) => {
    const tag = child?.tagName?.toLowerCase();
    return tag === "scene" || tag === "sceneref" || tag === "prologue" || tag === "epilogue";
  });
}

function collectActChildren(root) {
  return Array.from(root?.children || []).filter((child) => {
    const tag = child?.tagName?.toLowerCase();
    return tag === "act" || tag === "actref";
  });
}

function buildSceneLabel(scene, fallbackIndex) {
  const tag = scene.tagName.toLowerCase();
  if (tag === "prologue") return "Prologue";
  if (tag === "epilogue") return "Epilogue";
  const explicit = textOf(scene.querySelector("scenetitle"));
  if (explicit) return explicit;
  return `Scene ${scene.getAttribute("num") || fallbackIndex}`;
}

export function buildPeopleGraphFromXML(xmlString, title, category) {
  const doc = new DOMParser().parseFromString(xmlString || "", "text/xml");
  const root = doc.documentElement;

  if (!root || root.nodeName === "parsererror") {
    return { type: "invalid", title, category, people: [], acts: [] };
  }

  if (root.tagName.toLowerCase() === "poem" || root.querySelector("sonnets")) {
    return { type: "unsupported", title, category, people: [], acts: [] };
  }

  const registry = createCharacterRegistry(extractCast(root));
  const acts = [];
  let runningLine = 0;
  let speechCounter = 0;

  collectActChildren(root).forEach((actNode, actIndex) => {
    const actNum = actNode.getAttribute("num") || `${actIndex + 1}`;
    const actTitle = textOf(actNode.querySelector("acttitle")) || `Act ${actNum}`;
    const actId = `act-${slugify(actNum, `${actIndex + 1}`)}`;
    const act = {
      id: actId,
      number: actNum,
      label: actTitle,
      index: actIndex,
      scenes: [],
    };

    collectSceneChildren(actNode).forEach((sceneNode, sceneIndex) => {
      const sceneId = `${actId}-scene-${slugify(sceneNode.getAttribute("num") || `${sceneIndex + 1}`, `${sceneIndex + 1}`)}`;
      const scene = {
        id: sceneId,
        actId,
        actIndex,
        actLabel: actTitle,
        index: sceneIndex,
        number: sceneNode.getAttribute("num") || `${sceneIndex + 1}`,
        label: buildSceneLabel(sceneNode, sceneIndex + 1),
        location: textOf(sceneNode.querySelector("scenelocation")),
        kind: sceneNode.tagName.toLowerCase(),
        participants: new Set(),
        speakingParticipants: new Set(),
        speeches: [],
        stageDirections: [],
        startLine: null,
        endLine: null,
      };

      Array.from(sceneNode.children || []).forEach((child) => {
        const tag = child.tagName.toLowerCase();

        if (tag === "sp" || tag === "speech" || tag === "song") {
          const speakerEl = child.querySelector("speaker");
          const rawSpeaker = speakerEl?.getAttribute("long")
            || speakerEl?.getAttribute("short")
            || textOf(speakerEl);
          const speaker = registry.resolveSpeaker(rawSpeaker);
          if (speaker) {
            scene.participants.add(speaker.id);
            scene.speakingParticipants.add(speaker.id);
          }

          let lineStart = null;
          let lineEnd = null;
          let lineCount = 0;
          let preview = "";

          Array.from(child.children || []).forEach((lineChild) => {
            const lineTag = lineChild.tagName.toLowerCase();

            if (lineTag === "l" || lineTag === "line") {
              const parsedLine = parseLineNumber(lineChild);
              runningLine = Number.isFinite(parsedLine) ? parsedLine : runningLine + 1;
              const lineText = textOf(lineChild);
              if (!lineText) return;
              lineCount += 1;
              if (lineStart === null) lineStart = runningLine;
              lineEnd = runningLine;
              if (!preview) preview = lineText;
              if (scene.startLine === null) scene.startLine = runningLine;
              scene.endLine = runningLine;
              return;
            }

            if (lineTag === "recite") {
              lineChild.querySelectorAll("l, line").forEach((recitedLine) => {
                const parsedLine = parseLineNumber(recitedLine);
                runningLine = Number.isFinite(parsedLine) ? parsedLine : runningLine + 1;
                const lineText = textOf(recitedLine);
                if (!lineText) return;
                lineCount += 1;
                if (lineStart === null) lineStart = runningLine;
                lineEnd = runningLine;
                if (!preview) preview = lineText;
                if (scene.startLine === null) scene.startLine = runningLine;
                scene.endLine = runningLine;
              });
              return;
            }

            if (lineTag === "stage" || lineTag === "stagedir") {
              const stageText = textOf(lineTag === "stagedir" ? lineChild.querySelector("dir") || lineChild : lineChild);
              const mentioned = registry.detectInStageDirection(stageText);
              mentioned.forEach((id) => scene.participants.add(id));
              scene.stageDirections.push({
                text: stageText,
                mentionedCharacterIds: mentioned,
              });
            }
          });

          if (speaker) {
            scene.speeches.push({
              id: `speech-${speechCounter}`,
              speakerId: speaker.id,
              speakerName: speaker.name,
              lineStart,
              lineEnd,
              lineCount,
              preview,
            });
            speechCounter += 1;
          }
          return;
        }

        if (tag === "stage" || tag === "stagedir") {
          const stageText = textOf(tag === "stagedir" ? child.querySelector("dir") || child : child);
          const mentioned = registry.detectInStageDirection(stageText);
          mentioned.forEach((id) => scene.participants.add(id));
          scene.stageDirections.push({
            text: stageText,
            mentionedCharacterIds: mentioned,
          });
        }
      });

      const participantIds = [...scene.participants];
      const speakingIds = [...scene.speakingParticipants];
      act.scenes.push({
        ...scene,
        participants: participantIds,
        speakingParticipants: speakingIds,
      });
    });

    acts.push(act);
  });

  return {
    type: "play",
    title,
    category,
    people: registry.getAll(),
    acts,
  };
}

function sceneReference(scene, lineStart = null) {
  return {
    sceneId: scene.id,
    sceneLabel: scene.label,
    actId: scene.actId,
    actLabel: scene.actLabel,
    location: scene.location,
    lineStart: lineStart || scene.startLine || 1,
  };
}

function pairKey(a, b) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function buildPeopleNetwork(graph, { actId = "all", sceneId = "all", edgeMode = "co_present" } = {}) {
  if (!graph?.acts?.length) {
    return {
      nodes: [],
      edges: [],
      scenes: [],
      stats: { sceneCount: 0, nodeCount: 0, edgeCount: 0, exchangeCount: 0 },
    };
  }

  let acts = graph.acts;
  if (actId !== "all") acts = acts.filter((act) => act.id === actId);
  let scenes = acts.flatMap((act) => act.scenes);
  if (sceneId !== "all") scenes = scenes.filter((scene) => scene.id === sceneId);

  const nodeMap = new Map();
  const edgeMap = new Map();
  const peopleById = new Map((graph.people || []).map((person) => [person.id, person]));

  function getNode(id) {
    if (!nodeMap.has(id)) {
      const person = peopleById.get(id);
      nodeMap.set(id, {
        ...(person || { id, name: id, short: "", desc: "", gender: "", inferred: true }),
        scenes: 0,
        speakingScenes: 0,
        speechCount: 0,
        lineCount: 0,
        firstLine: null,
        sceneRefs: [],
      });
    }
    return nodeMap.get(id);
  }

  function getEdge(sourceId, targetId) {
    const key = pairKey(sourceId, targetId);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        id: key,
        sourceId: sourceId < targetId ? sourceId : targetId,
        targetId: sourceId < targetId ? targetId : sourceId,
        coPresenceCount: 0,
        exchangeCount: 0,
        firstLine: null,
        sceneRefs: [],
        _sceneIds: new Set(),
      });
    }
    return edgeMap.get(key);
  }

  scenes.forEach((scene) => {
    const sceneSpeechCounts = new Map();
    const sceneLineCounts = new Map();

    scene.participants.forEach((personId) => {
      const node = getNode(personId);
      node.scenes += 1;
      node.sceneRefs.push(sceneReference(scene));
    });

    scene.speakingParticipants.forEach((personId) => {
      const node = getNode(personId);
      node.speakingScenes += 1;
    });

    scene.speeches.forEach((speech) => {
      if (!speech.speakerId) return;
      sceneSpeechCounts.set(speech.speakerId, (sceneSpeechCounts.get(speech.speakerId) || 0) + 1);
      sceneLineCounts.set(speech.speakerId, (sceneLineCounts.get(speech.speakerId) || 0) + (speech.lineCount || 0));
      const node = getNode(speech.speakerId);
      node.speechCount += 1;
      node.lineCount += speech.lineCount || 0;
      if (speech.lineStart !== null && (node.firstLine === null || speech.lineStart < node.firstLine)) {
        node.firstLine = speech.lineStart;
      }
    });

    const participants = [...scene.participants].sort();
    for (let i = 0; i < participants.length; i += 1) {
      for (let j = i + 1; j < participants.length; j += 1) {
        const edge = getEdge(participants[i], participants[j]);
        edge.coPresenceCount += 1;
        if (!edge._sceneIds.has(scene.id)) {
          edge._sceneIds.add(scene.id);
          edge.sceneRefs.push(sceneReference(scene));
        }
        if (scene.startLine !== null && (edge.firstLine === null || scene.startLine < edge.firstLine)) {
          edge.firstLine = scene.startLine;
        }
      }
    }

    let previousSpeech = null;
    scene.speeches.forEach((speech) => {
      if (!speech.speakerId) return;
      if (previousSpeech && previousSpeech.speakerId !== speech.speakerId) {
        const edge = getEdge(previousSpeech.speakerId, speech.speakerId);
        edge.exchangeCount += 1;
        if (!edge._sceneIds.has(scene.id)) {
          edge._sceneIds.add(scene.id);
          edge.sceneRefs.push(sceneReference(scene, speech.lineStart || scene.startLine || 1));
        }
        const lineStart = speech.lineStart || previousSpeech.lineStart || scene.startLine;
        if (lineStart !== null && (edge.firstLine === null || lineStart < edge.firstLine)) {
          edge.firstLine = lineStart;
        }
      }
      previousSpeech = speech;
    });
  });

  const edges = [...edgeMap.values()].map((edge) => {
    const source = peopleById.get(edge.sourceId) || nodeMap.get(edge.sourceId);
    const target = peopleById.get(edge.targetId) || nodeMap.get(edge.targetId);
    return {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourceName: source?.name || edge.sourceId,
      targetName: target?.name || edge.targetId,
      coPresenceCount: edge.coPresenceCount,
      exchangeCount: edge.exchangeCount,
      firstLine: edge.firstLine,
      sceneRefs: edge.sceneRefs,
      weight: edgeMode === "turn_exchange" ? edge.exchangeCount : edge.coPresenceCount,
    };
  }).filter((edge) => edge.weight > 0);

  const connectionWeightByNode = new Map();
  edges.forEach((edge) => {
    connectionWeightByNode.set(edge.sourceId, (connectionWeightByNode.get(edge.sourceId) || 0) + edge.weight);
    connectionWeightByNode.set(edge.targetId, (connectionWeightByNode.get(edge.targetId) || 0) + edge.weight);
  });

  const nodes = [...nodeMap.values()].map((node) => ({
    ...node,
    connectionWeight: connectionWeightByNode.get(node.id) || 0,
  })).sort((a, b) => {
    if (b.connectionWeight !== a.connectionWeight) return b.connectionWeight - a.connectionWeight;
    if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
    return a.name.localeCompare(b.name);
  });

  return {
    nodes,
    edges,
    scenes,
    stats: {
      sceneCount: scenes.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      exchangeCount: edges.reduce((sum, edge) => sum + edge.exchangeCount, 0),
    },
  };
}
