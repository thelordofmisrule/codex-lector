const STORAGE_KEY = "codex-chinese-study-v1";

const SEEDED_ITEMS = [
  {
    hanzi: "结果",
    pinyin: "jieguo",
    gloss: "result; in the end",
    notes: "Useful both as a noun and as a discourse marker when someone is telling a story.",
    example: "我本来想早点回家，结果又加班到十一点。",
    exampleTranslation: "I meant to get home early, but I ended up working overtime until eleven.",
    clips: [
      {
        title: "Office drama clip",
        quote: "结果老板突然说，今晚谁都别走。",
        sourceLabel: "Workplace series",
        note: "Narrative pivot: the speaker sets up one expectation and then reverses it with 结果.",
        mediaUrl: "",
        sourceUrl: "",
        startSeconds: 0,
      },
      {
        title: "Rom-com argument",
        quote: "我等了你半天，结果你根本没来。",
        sourceLabel: "Romantic comedy",
        note: "Often carries disappointment or frustration.",
        mediaUrl: "",
        sourceUrl: "",
        startSeconds: 0,
      },
    ],
  },
  {
    hanzi: "明白",
    pinyin: "mingbai",
    gloss: "to understand; clear",
    notes: "Very high-frequency and more colloquial than 理解 in many situations.",
    example: "你先别急，我明白你的意思。",
    exampleTranslation: "Don’t rush; I understand what you mean.",
    clips: [
      {
        title: "Police interrogation",
        quote: "你明白我现在在问什么吗？",
        sourceLabel: "Crime drama",
        note: "Used to check understanding or establish seriousness.",
        mediaUrl: "",
        sourceUrl: "",
        startSeconds: 0,
      },
    ],
  },
  {
    hanzi: "难受",
    pinyin: "nanshou",
    gloss: "to feel awful; uncomfortable; distressed",
    notes: "Can be physical or emotional. A good word to learn through tone and context.",
    example: "听到这个消息以后，她心里特别难受。",
    exampleTranslation: "After hearing the news, she felt terrible.",
    clips: [
      {
        title: "Hospital scene",
        quote: "我有点难受，想先躺一会儿。",
        sourceLabel: "Family drama",
        note: "Physical discomfort reading.",
        mediaUrl: "",
        sourceUrl: "",
        startSeconds: 0,
      },
      {
        title: "Breakup aftermath",
        quote: "你这样说，我真的很难受。",
        sourceLabel: "Urban drama",
        note: "Emotional hurt reading.",
        mediaUrl: "",
        sourceUrl: "",
        startSeconds: 0,
      },
    ],
  },
];

function makeId(prefix = "card") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(iso, minutes) {
  const next = new Date(iso || Date.now());
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
}

function addDays(iso, days) {
  const next = new Date(iso || Date.now());
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function normalizeClip(clip = {}) {
  return {
    id: String(clip.id || makeId("clip")),
    title: String(clip.title || "").trim(),
    quote: String(clip.quote || "").trim(),
    sourceLabel: String(clip.sourceLabel || "").trim(),
    note: String(clip.note || "").trim(),
    mediaUrl: String(clip.mediaUrl || "").trim(),
    sourceUrl: String(clip.sourceUrl || "").trim(),
    startSeconds: Math.max(0, Number(clip.startSeconds) || 0),
  };
}

export function createChineseCard(card = {}) {
  const createdAt = String(card.createdAt || nowIso());
  return {
    id: String(card.id || makeId("hanzi")),
    hanzi: String(card.hanzi || "").trim(),
    pinyin: String(card.pinyin || "").trim(),
    gloss: String(card.gloss || "").trim(),
    notes: String(card.notes || "").trim(),
    example: String(card.example || "").trim(),
    exampleTranslation: String(card.exampleTranslation || "").trim(),
    tags: Array.isArray(card.tags)
      ? [...new Set(card.tags.map((tag) => String(tag || "").trim()).filter(Boolean))]
      : [],
    clips: Array.isArray(card.clips) ? card.clips.map(normalizeClip) : [],
    ease: Math.max(1.3, Number(card.ease) || 2.35),
    intervalDays: Math.max(0, Number(card.intervalDays) || 0),
    reps: Math.max(0, Number(card.reps) || 0),
    dueAt: String(card.dueAt || createdAt),
    lastReviewedAt: card.lastReviewedAt ? String(card.lastReviewedAt) : "",
    state: String(card.state || "new"),
    createdAt,
    updatedAt: String(card.updatedAt || createdAt),
  };
}

function seededState() {
  return {
    items: SEEDED_ITEMS.map((item) => createChineseCard(item)),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return seededState();
  const items = Array.isArray(raw.items) ? raw.items.map(createChineseCard) : [];
  return {
    items,
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso()),
  };
}

export function loadChineseStudyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seededState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return seededState();
  }
}

export function saveChineseStudyState(state) {
  const normalized = normalizeState(state);
  const next = {
    ...normalized,
    updatedAt: nowIso(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function upsertChineseStudyCard(state, card) {
  const nextCard = createChineseCard({
    ...card,
    updatedAt: nowIso(),
  });
  const items = [...(state?.items || [])];
  const index = items.findIndex((item) => item.id === nextCard.id);
  if (index >= 0) items[index] = nextCard;
  else items.unshift(nextCard);
  return {
    ...(state || {}),
    items,
    updatedAt: nowIso(),
  };
}

export function deleteChineseStudyCard(state, cardId) {
  return {
    ...(state || {}),
    items: (state?.items || []).filter((item) => item.id !== cardId),
    updatedAt: nowIso(),
  };
}

export function dueChineseCards(items, currentTime = new Date()) {
  const now = new Date(currentTime);
  return [...(items || [])]
    .filter((item) => new Date(item.dueAt || 0) <= now)
    .sort((left, right) => (
      new Date(left.dueAt || 0).getTime() - new Date(right.dueAt || 0).getTime()
        || new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()
    ));
}

export function summarizeChineseCards(items, currentTime = new Date()) {
  const now = new Date(currentTime);
  const todayKey = now.toISOString().slice(0, 10);
  const summary = {
    total: 0,
    due: 0,
    new: 0,
    learning: 0,
    mature: 0,
    reviewedToday: 0,
  };

  for (const item of items || []) {
    summary.total += 1;
    if (new Date(item.dueAt || 0) <= now) summary.due += 1;
    if ((item.state || "new") === "new") summary.new += 1;
    else if ((item.state || "") === "mature") summary.mature += 1;
    else summary.learning += 1;
    if (String(item.lastReviewedAt || "").slice(0, 10) === todayKey) summary.reviewedToday += 1;
  }

  return summary;
}

export function reviewChineseCard(card, rating, currentTime = new Date()) {
  const item = createChineseCard(card);
  const now = new Date(currentTime).toISOString();
  const next = {
    ...item,
    lastReviewedAt: now,
    updatedAt: now,
  };

  if (rating === "again") {
    next.state = "learning";
    next.reps = 0;
    next.intervalDays = 0;
    next.ease = Math.max(1.3, next.ease - 0.2);
    next.dueAt = addMinutes(now, 10);
    return next;
  }

  if (rating === "hard") {
    const nextInterval = next.intervalDays > 0 ? Math.max(1, Math.round(next.intervalDays * 1.2)) : 1;
    next.state = nextInterval >= 21 ? "mature" : "learning";
    next.reps += 1;
    next.intervalDays = nextInterval;
    next.ease = Math.max(1.3, next.ease - 0.08);
    next.dueAt = addDays(now, nextInterval);
    return next;
  }

  if (rating === "easy") {
    const nextInterval = next.intervalDays > 0
      ? Math.max(4, Math.round((next.intervalDays * (next.ease + 0.45)) + 2))
      : 4;
    next.state = nextInterval >= 21 ? "mature" : "learning";
    next.reps += 1;
    next.intervalDays = nextInterval;
    next.ease = Math.min(3.1, next.ease + 0.08);
    next.dueAt = addDays(now, nextInterval);
    return next;
  }

  const nextInterval = next.intervalDays <= 0
    ? 1
    : next.intervalDays === 1
      ? 3
      : Math.max(2, Math.round(next.intervalDays * Math.max(1.7, next.ease)));
  next.state = nextInterval >= 21 ? "mature" : "learning";
  next.reps += 1;
  next.intervalDays = nextInterval;
  next.ease = Math.min(3, next.ease + 0.03);
  next.dueAt = addDays(now, nextInterval);
  return next;
}

export function createEmptyChineseCard() {
  return createChineseCard({
    hanzi: "",
    pinyin: "",
    gloss: "",
    notes: "",
    example: "",
    exampleTranslation: "",
    tags: [],
    clips: [
      normalizeClip({}),
    ],
    dueAt: nowIso(),
    state: "new",
  });
}

