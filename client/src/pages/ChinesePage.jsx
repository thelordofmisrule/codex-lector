import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";
import { canAccessChineseMode } from "../lib/privateFeatures";
import {
  createChineseCard,
  createEmptyChineseCard,
  deleteChineseStudyCard,
  dueChineseCards,
  loadChineseStudyState,
  reviewChineseCard,
  saveChineseStudyState,
  summarizeChineseCards,
  upsertChineseStudyCard,
} from "../lib/chineseStudy";

function fmtDue(iso) {
  if (!iso) return "Now";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Now";
  }
}

function isDirectVideo(url) {
  return /\.(mp4|webm|ogg|m4v)(\?|#|$)/i.test(String(url || "").trim());
}

function splitTags(raw) {
  return [...new Set(
    String(raw || "")
      .split(/[,\n;]+/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  )];
}

function StatCard({ label, value, note }) {
  return (
    <div
      className="chinese-stat-card"
      style={{
        padding: "16px 18px",
        borderRadius: 16,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          {note}
        </div>
      )}
    </div>
  );
}

function ClipCard({ clip }) {
  const directVideo = isDirectVideo(clip.mediaUrl);
  return (
    <div
      className="chinese-clip-card"
      style={{
        borderRadius: 14,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--accent)" }}>
          {clip.title || "Usage clip"}
        </div>
        {(clip.sourceLabel || clip.startSeconds) && (
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-light)" }}>
            {[clip.sourceLabel, clip.startSeconds ? `Start ${clip.startSeconds}s` : ""].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {clip.quote && (
        <div style={{ fontFamily: "var(--font-fell)", fontSize: 16, color: "var(--text)", lineHeight: 1.7 }}>
          {clip.quote}
        </div>
      )}

      {directVideo ? (
        <video
          controls
          preload="metadata"
          src={clip.mediaUrl}
          style={{
            width: "100%",
            maxHeight: 280,
            borderRadius: 12,
            background: "#111",
          }}
        />
      ) : clip.mediaUrl ? (
        <a className="btn btn-secondary btn-sm" href={clip.mediaUrl} target="_blank" rel="noopener noreferrer">
          Open Clip
        </a>
      ) : null}

      {clip.note && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
          {clip.note}
        </div>
      )}

      {clip.sourceUrl && (
        <div>
          <a href={clip.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
            Source context
          </a>
        </div>
      )}
    </div>
  );
}

function ClipEditor({ clip, index, onChange, onRemove, disableRemove = false }) {
  return (
    <div
      className="chinese-clip-editor"
      style={{
        borderRadius: 12,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)" }}>
          Clip {index + 1}
        </div>
        <button className="btn btn-ghost btn-sm" disabled={disableRemove} onClick={onRemove} style={{ color: "var(--text-light)" }}>
          Remove
        </button>
      </div>

      <input className="input" value={clip.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="Clip label" />
      <textarea className="input" rows={2} value={clip.quote} onChange={(event) => onChange({ quote: event.target.value })} placeholder="Quote with the target word" style={{ resize: "vertical" }} />
      <input className="input" value={clip.sourceLabel} onChange={(event) => onChange({ sourceLabel: event.target.value })} placeholder="Movie / show / scene" />
      <input className="input" value={clip.mediaUrl} onChange={(event) => onChange({ mediaUrl: event.target.value })} placeholder="Direct video URL or clip link" />
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <input className="input" value={clip.sourceUrl} onChange={(event) => onChange({ sourceUrl: event.target.value })} placeholder="Reference URL" />
        <input className="input" type="number" min="0" value={clip.startSeconds} onChange={(event) => onChange({ startSeconds: Number(event.target.value) || 0 })} placeholder="Start seconds" />
      </div>
      <textarea className="input" rows={2} value={clip.note} onChange={(event) => onChange({ note: event.target.value })} placeholder="Why this usage matters" style={{ resize: "vertical" }} />
    </div>
  );
}

export default function ChinesePage() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const canAccess = canAccessChineseMode(user);
  const [state, setState] = useState({ items: [] });
  const [loaded, setLoaded] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(createEmptyChineseCard());

  useEffect(() => {
    if (!canAccess) {
      setLoaded(true);
      return;
    }
    const next = loadChineseStudyState();
    setState(next);
    setDraft(next.items[0] ? createChineseCard(next.items[0]) : createEmptyChineseCard());
    setSelectedId(next.items[0]?.id || "");
    setLoaded(true);
  }, [canAccess]);

  useEffect(() => {
    if (!loaded || !canAccess) return;
    saveChineseStudyState(state);
  }, [canAccess, loaded, state]);

  const dueCards = useMemo(() => dueChineseCards(state.items), [state.items]);
  const summary = useMemo(() => summarizeChineseCards(state.items), [state.items]);
  const currentCard = dueCards[0] || null;

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = [...state.items].sort((left, right) => (
      new Date(left.dueAt || 0).getTime() - new Date(right.dueAt || 0).getTime()
        || String(left.hanzi || "").localeCompare(String(right.hanzi || ""))
    ));
    if (!needle) return items;
    return items.filter((item) => (
      item.hanzi.toLowerCase().includes(needle)
      || item.pinyin.toLowerCase().includes(needle)
      || item.gloss.toLowerCase().includes(needle)
      || item.example.toLowerCase().includes(needle)
      || item.tags.some((tag) => tag.toLowerCase().includes(needle))
    ));
  }, [query, state.items]);

  useEffect(() => {
    setRevealAnswer(false);
  }, [currentCard?.id]);

  const selectCardForEdit = (card) => {
    setSelectedId(card.id);
    setDraft(createChineseCard(card));
  };

  const resetDraft = () => {
    setSelectedId("");
    setDraft(createEmptyChineseCard());
  };

  const updateDraft = (patch) => {
    setDraft((prev) => createChineseCard({ ...prev, ...patch }));
  };

  const updateClip = (clipId, patch) => {
    updateDraft({
      clips: draft.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
    });
  };

  const addClip = () => {
    updateDraft({
      clips: [
        ...draft.clips,
        {
          id: `clip-${Date.now()}`,
          title: "",
          quote: "",
          sourceLabel: "",
          note: "",
          mediaUrl: "",
          sourceUrl: "",
          startSeconds: 0,
        },
      ],
    });
  };

  const removeClip = (clipId) => {
    updateDraft({
      clips: draft.clips.filter((clip) => clip.id !== clipId),
    });
  };

  const saveCard = () => {
    if (!draft.hanzi.trim() || !draft.gloss.trim()) {
      toast?.error("Add at least the word and its gloss.");
      return;
    }
    const wasEditing = !!selectedId;
    const next = upsertChineseStudyCard(state, {
      ...draft,
      tags: splitTags(draft.tags?.join(", ")),
      clips: draft.clips.filter((clip) => clip.title || clip.quote || clip.mediaUrl || clip.sourceLabel || clip.note || clip.sourceUrl),
      dueAt: draft.dueAt || new Date().toISOString(),
    });
    setState(next);
    const saved = next.items.find((item) => item.id === draft.id) || next.items[0];
    setSelectedId(saved?.id || "");
    setDraft(saved ? createChineseCard(saved) : createEmptyChineseCard());
    toast?.success(wasEditing ? "Word updated." : "Word added.");
  };

  const removeCard = async () => {
    if (!draft.id) return;
    const ok = await confirm({
      title: "Delete Chinese Card",
      message: `Delete ${draft.hanzi || "this card"} from your Chinese deck?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const next = deleteChineseStudyCard(state, draft.id);
    setState(next);
    resetDraft();
    toast?.success("Word deleted.");
  };

  const reviewCurrentCard = (rating) => {
    if (!currentCard) return;
    const updated = reviewChineseCard(currentCard, rating);
    setState((prev) => upsertChineseStudyCard(prev, updated));
    toast?.success(`${currentCard.hanzi} marked ${rating}.`);
  };

  const copyDeckJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.items, null, 2));
      toast?.success("Deck JSON copied.");
    } catch {
      toast?.error("Could not copy the deck.");
    }
  };

  if (!user) {
    return (
      <div className="animate-in chinese-mode-locked" style={{ maxWidth: 640, margin: "64px auto", padding: "0 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", marginBottom: 10 }}>Chinese Mode</h1>
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", lineHeight: 1.8 }}>
          Sign in to open your private Chinese study workspace.
        </p>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="animate-in chinese-mode-locked" style={{ maxWidth: 640, margin: "64px auto", padding: "0 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", marginBottom: 10 }}>Chinese Mode</h1>
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", lineHeight: 1.8 }}>
          This is a private study room and it is not enabled for your account.
        </p>
      </div>
    );
  }

  if (!loaded) {
    return <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" /></div>;
  }

  return (
    <div className="animate-in chinese-mode-page" style={{ maxWidth: 1220, margin: "0 auto", padding: "42px 24px 88px" }}>
      <div className="chinese-mode-hero" style={{ maxWidth: 860, marginBottom: 28 }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 10 }}>
          Private Study Room
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1.2 }}>
          Chinese Mode
        </h1>
        <p style={{ margin: "14px 0 0", color: "var(--text-muted)", lineHeight: 1.8, fontSize: 16, maxWidth: 760 }}>
          A private SRS workspace for learning Chinese vocabulary in context. Review a word, reveal its meaning and example sentence, then attach two or three movie or TV clips so the word gets learned through real speech rather than isolated flashcards.
        </p>
      </div>

      <div className="chinese-mode-stats" style={{ display: "grid", gap: 14, marginBottom: 28 }}>
        <StatCard label="Due now" value={summary.due} note="Cards waiting in the review queue." />
        <StatCard label="New" value={summary.new} note="Fresh words you still need to anchor." />
        <StatCard label="Learning" value={summary.learning} note="Cards still cycling on shorter intervals." />
        <StatCard label="Mature" value={summary.mature} note="Words that have reached longer spacing." />
        <StatCard label="Reviewed today" value={summary.reviewedToday} note="Cards already touched in this session." />
      </div>

      <div className="chinese-mode-layout" style={{ display: "grid", gap: 28, alignItems: "start" }}>
        <section
          className="chinese-panel chinese-panel-soft"
          style={{
            borderRadius: 20,
            padding: 22,
            display: "grid",
            gap: 18,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
                Review Session
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--accent)" }}>
                {currentCard ? "Current card" : "Queue clear"}
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={copyDeckJson}>
              Copy Deck JSON
            </button>
          </div>

          {!currentCard ? (
            <div className="chinese-empty-state" style={{ padding: "32px 18px", borderRadius: 18, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", marginBottom: 8 }}>
                No cards due right now
              </div>
              <div style={{ color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 560, margin: "0 auto" }}>
                Add new vocabulary on the right, or wait for the next review window. Cards marked <em>Again</em> come back in ten minutes, which makes this good for tight focused sessions.
              </div>
            </div>
          ) : (
            <>
              <div
                className="chinese-review-card"
                style={{
                  borderRadius: 22,
                  padding: "28px min(5vw, 34px)",
                  display: "grid",
                  gap: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: 1.4 }}>
                    Due {fmtDue(currentCard.dueAt)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                    Interval {currentCard.intervalDays > 0 ? `${currentCard.intervalDays} day${currentCard.intervalDays === 1 ? "" : "s"}` : "new"} · Ease {currentCard.ease.toFixed(2)}
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "\"Noto Serif SC\", var(--font-display)", fontSize: "clamp(44px, 9vw, 84px)", color: "var(--accent)", lineHeight: 1.06, letterSpacing: 1 }}>
                    {currentCard.hanzi}
                  </div>
                  {revealAnswer && currentCard.pinyin && (
                    <div style={{ marginTop: 10, fontSize: 20, color: "var(--text-light)", letterSpacing: 0.8 }}>
                      {currentCard.pinyin}
                    </div>
                  )}
                </div>

                {!revealAnswer ? (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button className="btn btn-primary" onClick={() => setRevealAnswer(true)}>
                      Reveal meaning and context
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
                          Meaning
                        </div>
                        <div style={{ fontSize: 20, color: "var(--text)", lineHeight: 1.5 }}>
                          {currentCard.gloss}
                        </div>
                      </div>

                      {(currentCard.example || currentCard.exampleTranslation) && (
                        <div
                          className="chinese-example-box"
                          style={{
                            borderRadius: 16,
                            padding: 16,
                          }}
                        >
                          <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                            Sentence Context
                          </div>
                          {currentCard.example && (
                            <div style={{ fontFamily: "\"Noto Serif SC\", var(--font-fell)", fontSize: 21, color: "var(--text)", lineHeight: 1.8 }}>
                              {currentCard.example}
                            </div>
                          )}
                          {currentCard.exampleTranslation && (
                            <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
                              {currentCard.exampleTranslation}
                            </div>
                          )}
                        </div>
                      )}

                      {currentCard.notes && (
                        <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.8 }}>
                          {currentCard.notes}
                        </div>
                      )}

                      {currentCard.clips.length > 0 && (
                        <div style={{ display: "grid", gap: 12 }}>
                          <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
                            Movie and TV usage
                          </div>
                          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                            {currentCard.clips.map((clip) => (
                              <ClipCard key={clip.id} clip={clip} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
                        How did it go?
                      </div>
                      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
                        <button className="btn btn-ghost" onClick={() => reviewCurrentCard("again")} style={{ color: "var(--danger)" }}>Again</button>
                        <button className="btn btn-secondary" onClick={() => reviewCurrentCard("hard")}>Hard</button>
                        <button className="btn btn-primary" onClick={() => reviewCurrentCard("good")}>Good</button>
                        <button className="btn btn-secondary" onClick={() => reviewCurrentCard("easy")}>Easy</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {dueCards.length > 1 && (
                <div style={{ fontSize: 13, color: "var(--text-light)" }}>
                  {dueCards.length - 1} more card{dueCards.length - 1 === 1 ? "" : "s"} waiting after this one.
                </div>
              )}
            </>
          )}
        </section>

        <section className="chinese-mode-sidebar" style={{ display: "grid", gap: 18 }}>
          <div
            className="chinese-panel"
            style={{
              borderRadius: 20,
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)" }}>
                  {selectedId ? "Edit word" : "Add word"}
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-light)", lineHeight: 1.6 }}>
                  Build the card around context first, then attach a few real clips.
                </div>
              </div>
              {selectedId && (
                <button className="btn btn-ghost btn-sm" onClick={resetDraft} style={{ color: "var(--text-light)" }}>
                  New card
                </button>
              )}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <input className="input" value={draft.hanzi} onChange={(event) => updateDraft({ hanzi: event.target.value })} placeholder="Word" />
                <input className="input" value={draft.pinyin} onChange={(event) => updateDraft({ pinyin: event.target.value })} placeholder="Pinyin" />
              </div>
              <input className="input" value={draft.gloss} onChange={(event) => updateDraft({ gloss: event.target.value })} placeholder="Meaning / gloss" />
              <textarea className="input" rows={2} value={draft.example} onChange={(event) => updateDraft({ example: event.target.value })} placeholder="Example sentence" style={{ resize: "vertical" }} />
              <textarea className="input" rows={2} value={draft.exampleTranslation} onChange={(event) => updateDraft({ exampleTranslation: event.target.value })} placeholder="Example translation" style={{ resize: "vertical" }} />
              <textarea className="input" rows={3} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} placeholder="Usage notes, register, memory hooks" style={{ resize: "vertical" }} />
              <input className="input" value={draft.tags.join(", ")} onChange={(event) => updateDraft({ tags: splitTags(event.target.value) })} placeholder="Tags (comma separated)" />
            </div>

            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
                  Usage clips
                </div>
                <button className="btn btn-secondary btn-sm" onClick={addClip}>
                  Add Clip
                </button>
              </div>
              {draft.clips.map((clip, index) => (
                <ClipEditor
                  key={clip.id}
                  clip={clip}
                  index={index}
                  onChange={(patch) => updateClip(clip.id, patch)}
                  onRemove={() => removeClip(clip.id)}
                  disableRemove={draft.clips.length === 1}
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <button className="btn btn-primary" onClick={saveCard}>
                {selectedId ? "Save word" : "Add word"}
              </button>
              {selectedId && (
                <button className="btn btn-ghost" onClick={removeCard} style={{ color: "var(--danger)" }}>
                  Delete
                </button>
              )}
            </div>
          </div>

          <div
            className="chinese-panel"
            style={{
              borderRadius: 20,
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)" }}>
                  Deck
                </div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-light)" }}>
                  {filteredItems.length} card{filteredItems.length === 1 ? "" : "s"}
                </div>
              </div>
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deck…" style={{ minWidth: 180 }} />
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", lineHeight: 1.8 }}>
                No cards match that search yet.
              </div>
            ) : (
              <div className="chinese-deck-list" style={{ display: "grid", gap: 10 }}>
                {filteredItems.map((item) => {
                  const selected = item.id === selectedId;
                  const dueNow = new Date(item.dueAt || 0) <= new Date();
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectCardForEdit(item)}
                      className={`chinese-deck-item${selected ? " is-selected" : ""}`}
                      style={{
                        textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: 14,
                        cursor: "pointer",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: "\"Noto Serif SC\", var(--font-display)", fontSize: 22, color: "var(--accent)", lineHeight: 1.1 }}>
                            {item.hanzi}
                          </div>
                          {item.pinyin && (
                            <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-light)" }}>
                              {item.pinyin}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: dueNow ? "var(--danger)" : "var(--text-light)", textTransform: "uppercase", letterSpacing: 1.2 }}>
                          {dueNow ? "Due now" : fmtDue(item.dueAt)}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                        {item.gloss}
                      </div>
                      {item.example && (
                        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
                          {item.example}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
