const LINE_CACHE = new Map();
const WORD_CACHE = new Map();

const WORD_TOKEN_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*|[^A-Za-z]+/g;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const SPECIAL_WORDS = {
  ardea: ["Ar", "de", "a"],
  collatium: ["Col", "la", "ti", "um"],
  lucrece: ["Lu", "crece"],
  tarquin: ["Tar", "quin"],
  "o'er": ["o'er"],
  "e'en": ["e'en"],
  "ne'er": ["ne'er"],
  "heav'n": ["heav'n"],
  "pow'r": ["pow'r"],
  "flow'r": ["flow'r"],
  "show'r": ["show'r"],
  "ev'n": ["ev'n"],
};

function isLetter(char) {
  return /[A-Za-z]/.test(char || "");
}

function isVowel(word, index) {
  const char = (word[index] || "").toLowerCase();
  if (VOWELS.has(char)) return true;
  if (char !== "y") return false;
  if (index === 0) return false;
  const prev = (word[index - 1] || "").toLowerCase();
  return isLetter(prev) && !VOWELS.has(prev);
}

function findVowelGroups(word) {
  const groups = [];
  let index = 0;
  while (index < word.length) {
    if (!isLetter(word[index]) || !isVowel(word, index)) {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < word.length && isLetter(word[index]) && isVowel(word, index)) {
      index += 1;
    }
    groups.push({ start, end: index - 1 });
  }
  return groups;
}

function mergeTrailingSilentGroup(groups, normalizedWord) {
  if (groups.length <= 1) return groups;
  const last = groups[groups.length - 1];
  if (!last) return groups;

  const endsWithSilentE = normalizedWord.endsWith("e")
    && last.start === normalizedWord.length - 1
    && !/[aeiou]le$/.test(normalizedWord);
  const endsWithSilentEd = normalizedWord.endsWith("ed")
    && last.start === normalizedWord.length - 2
    && !/[td]ed$/.test(normalizedWord);
  const endsWithSilentEs = normalizedWord.endsWith("es")
    && last.start === normalizedWord.length - 2
    && !/(ses|zes|xes|ches|shes)$/.test(normalizedWord);

  if (endsWithSilentE || endsWithSilentEd || endsWithSilentEs) {
    return groups.slice(0, -1);
  }
  return groups;
}

function splitBoundary(word, currentGroup, nextGroup) {
  const cluster = word.slice(currentGroup.end + 1, nextGroup.start).replace(/['’]/g, "");
  if (!cluster.length) return nextGroup.start;
  if (cluster.length === 1) return currentGroup.end + 1;
  if (cluster.length === 2) return nextGroup.start - 1;
  return nextGroup.start - Math.floor(cluster.length / 2);
}

function syllabifyWord(word) {
  const cacheKey = String(word || "");
  if (WORD_CACHE.has(cacheKey)) return WORD_CACHE.get(cacheKey);

  const source = String(word || "");
  const normalized = source.toLowerCase().replace(/’/g, "'");
  if (SPECIAL_WORDS[normalized]) {
    WORD_CACHE.set(cacheKey, SPECIAL_WORDS[normalized]);
    return SPECIAL_WORDS[normalized];
  }

  if (source.length <= 3) {
    const fallback = [source];
    WORD_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  let groups = findVowelGroups(source);
  if (!groups.length) {
    const fallback = [source];
    WORD_CACHE.set(cacheKey, fallback);
    return fallback;
  }

  groups = mergeTrailingSilentGroup(groups, normalized);
  if (groups.length <= 1) {
    const monosyllable = [source];
    WORD_CACHE.set(cacheKey, monosyllable);
    return monosyllable;
  }

  const syllables = [];
  let start = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const current = groups[index];
    const next = groups[index + 1];
    const end = next ? splitBoundary(source, current, next) : source.length;
    const part = source.slice(start, end);
    if (part) syllables.push(part);
    start = end;
  }

  const result = syllables.filter(Boolean);
  const finalResult = result.length ? result : [source];
  WORD_CACHE.set(cacheKey, finalResult);
  return finalResult;
}

function inferStressPattern(syllableCount) {
  if (syllableCount <= 0) return "";
  let pattern = "";
  for (let index = 0; index < syllableCount; index += 1) {
    const trailingWeak = syllableCount % 2 === 1 && syllableCount > 1 && index === syllableCount - 1;
    pattern += trailingWeak ? "w" : (index % 2 === 0 ? "w" : "s");
  }
  return pattern;
}

function inferMeterLabel(syllableCount) {
  if (syllableCount === 10 || syllableCount === 11) return "Heuristic alternating pentameter";
  if (syllableCount === 8) return "Heuristic alternating tetrameter";
  if (syllableCount === 12) return "Heuristic alternating hexameter";
  return "Heuristic alternating stress";
}

export function parseProsodyScan(scanText, stressPattern = "") {
  const parts = String(scanText || "")
    .split("|")
    .map((part) => String(part || ""))
    .filter((part) => part.length > 0);

  if (!parts.length) return [];
  const fallbackPattern = inferStressPattern(parts.length);
  const pattern = String(stressPattern || "").trim();

  return parts.map((text, index) => {
    const stress = (pattern[index] === "s" || pattern[index] === "w")
      ? pattern[index]
      : fallbackPattern[index] || "w";
    return {
      text,
      stress,
      mark: stress === "s" ? "¯" : "˘",
    };
  });
}

export function analyzeProsodyLine(text) {
  const source = String(text || "");
  if (LINE_CACHE.has(source)) return LINE_CACHE.get(source);

  const rawTokens = source.match(WORD_TOKEN_RE) || [];
  const pendingSegments = [];
  let carry = "";

  rawTokens.forEach((token) => {
    if (!/[A-Za-z]/.test(token)) {
      carry += token;
      return;
    }

    const syllables = syllabifyWord(token);
    syllables.forEach((syllable, index) => {
      pendingSegments.push(`${index === 0 ? carry : ""}${syllable}`);
      carry = "";
    });
  });

  if (!pendingSegments.length) {
    const fallback = {
      text: source,
      scanText: source,
      stressPattern: source ? "w" : "",
      segments: source ? [{ text: source, stress: "w", mark: "˘" }] : [],
      syllableCount: source ? 1 : 0,
      meterLabel: inferMeterLabel(source ? 1 : 0),
    };
    LINE_CACHE.set(source, fallback);
    return fallback;
  }

  if (carry) {
    pendingSegments[pendingSegments.length - 1] += carry;
  }

  const stressPattern = inferStressPattern(pendingSegments.length);
  const analysis = {
    text: source,
    scanText: pendingSegments.join("|"),
    stressPattern,
    segments: parseProsodyScan(pendingSegments.join("|"), stressPattern),
    syllableCount: pendingSegments.length,
    meterLabel: inferMeterLabel(pendingSegments.length),
  };
  LINE_CACHE.set(source, analysis);
  return analysis;
}
