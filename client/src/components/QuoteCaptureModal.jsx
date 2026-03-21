import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../lib/ToastContext";
import { quoteImages as quoteImagesApi } from "../lib/api";
import {
  QUOTE_CAPTURE_THEMES,
  downloadQuoteCardPng,
  downloadQuoteCardSvg,
  getQuoteCapturePreviewStyle,
  normalizeQuoteText,
  quoteCapturePlainText,
} from "../lib/quoteCapture";

function buildFilename(title, extension) {
  const base = String(title || "codex-lector-quote")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "codex-lector-quote"}.${extension}`;
}

export default function QuoteCaptureModal({ quote, workSlug, onClose }) {
  const toast = useToast();
  const modalRef = useRef(null);
  const [themeId, setThemeId] = useState(QUOTE_CAPTURE_THEMES[0].id);
  const [busy, setBusy] = useState("");
  const [artLoading, setArtLoading] = useState(false);
  const [artError, setArtError] = useState("");
  const [artCollection, setArtCollection] = useState({ categoryUrl: "", notes: "", images: [] });
  const [selectedImageId, setSelectedImageId] = useState(0);
  const [backgroundOpacity, setBackgroundOpacity] = useState(36);

  useEffect(() => {
    setThemeId(QUOTE_CAPTURE_THEMES[0].id);
    setSelectedImageId(0);
    setBackgroundOpacity(36);
  }, [quote?.text, quote?.citation, quote?.title]);

  useEffect(() => {
    if (!workSlug) {
      setArtCollection({ categoryUrl: "", notes: "", images: [] });
      setArtError("");
      setArtLoading(false);
      return;
    }

    let ignore = false;
    setArtLoading(true);
    setArtError("");

    quoteImagesApi.forWork(workSlug)
      .then((data) => {
        if (ignore) return;
        setArtCollection({
          categoryUrl: data?.categoryUrl || "",
          notes: data?.notes || "",
          images: Array.isArray(data?.images) ? data.images : [],
        });
      })
      .catch((error) => {
        if (ignore) return;
        setArtCollection({ categoryUrl: "", notes: "", images: [] });
        setArtError(error?.message || "Could not load quote art.");
      })
      .finally(() => {
        if (!ignore) setArtLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [workSlug]);

  useEffect(() => {
    if (!quote) return undefined;

    const handlePointerDown = (event) => {
      const node = modalRef.current;
      if (!node || node.contains(event.target)) return;
      onClose?.();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, quote]);

  useEffect(() => {
    if (!quote) return undefined;

    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, [quote]);

  const selectedImage = useMemo(
    () => artCollection.images.find((image) => String(image.id) === String(selectedImageId)) || null,
    [artCollection.images, selectedImageId],
  );
  const payload = useMemo(() => ({
    text: quote?.text || "",
    title: quote?.title || "",
    citation: quote?.citation || "",
    author: quote?.author || "William Shakespeare",
    themeId,
    backgroundImageUrl: selectedImage?.imageUrl || "",
    backgroundOpacity: backgroundOpacity / 100,
  }), [backgroundOpacity, quote, selectedImage?.imageUrl, themeId]);

  const preview = getQuoteCapturePreviewStyle(themeId);
  const quoteLines = normalizeQuoteText(quote?.text || "").split("\n");

  if (!quote) return null;

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(quoteCapturePlainText(payload));
      toast?.success("Quote copied.");
    } catch {
      toast?.error("Could not copy quote.");
    }
  };

  const downloadSvg = async () => {
    try {
      setBusy("svg");
      await downloadQuoteCardSvg(payload, buildFilename(quote.title, "svg"));
    } catch (error) {
      toast?.error(error?.message || "Could not download SVG.");
    } finally {
      setBusy("");
    }
  };

  const downloadPng = async () => {
    try {
      setBusy("png");
      await downloadQuoteCardPng(payload, buildFilename(quote.title, "png"));
    } catch (error) {
      toast?.error(error?.message || "Could not download PNG.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        background: "rgba(12, 14, 18, 0.6)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 18,
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: "min(960px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 36px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "0 22px 48px rgba(0,0,0,0.22)",
          padding: 18,
          margin: "0 auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 4 }}>
              Shareable Export
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--accent)" }}>
              Beautiful Quote Capture
            </div>
            <div style={{ fontSize: 13, color: "var(--text-light)", marginTop: 4 }}>
              Export this passage as a polished card for posts, notes, or print.
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUOTE_CAPTURE_THEMES.map((theme) => (
              <button
                key={theme.id}
                className={theme.id === themeId ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => setThemeId(theme.id)}
              >
                {theme.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 3 }}>
                  Background Art
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Add open-source art related to this work behind the quote card.
                </div>
              </div>
              {(artCollection.categoryUrl || workSlug) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {workSlug && (
                    <Link className="btn btn-ghost btn-sm" to={`/gallery?work=${encodeURIComponent(workSlug)}`}>
                      Browse Gallery
                    </Link>
                  )}
                  {artCollection.categoryUrl && (
                    <a className="btn btn-ghost btn-sm" href={artCollection.categoryUrl} target="_blank" rel="noopener noreferrer">
                      Commons Category
                    </a>
                  )}
                </div>
              )}
            </div>

            {artCollection.notes && (
              <div style={{ color: "var(--text-light)", fontSize: 12, lineHeight: 1.5 }}>
                {artCollection.notes}
              </div>
            )}

            {artLoading ? (
              <div style={{ color: "var(--text-light)", fontSize: 13 }}>Loading art…</div>
            ) : artError ? (
              <div style={{ color: "var(--danger)", fontSize: 13 }}>{artError}</div>
            ) : artCollection.images.length === 0 ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border-light)",
                  background: "rgba(255,255,255,0.46)",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  fontSize: 13,
                }}
              >
                No background art is seeded for <strong>{quote.title}</strong> yet. You can still export the quote card without artwork.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                  <button
                    type="button"
                    className={selectedImageId ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
                    onClick={() => setSelectedImageId(0)}
                    style={{ minHeight: 108, justifyContent: "center" }}
                  >
                    No background
                  </button>
                  {artCollection.images.map((image) => {
                    const active = String(selectedImageId) === String(image.id);
                    return (
                      <button
                        key={image.id}
                        type="button"
                        className={active ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                        onClick={() => setSelectedImageId(image.id)}
                        style={{ padding: 6, display: "grid", gap: 6, textAlign: "left" }}
                      >
                        <img
                          src={image.imageUrl}
                          alt={image.label}
                          loading="lazy"
                          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                        <span style={{ display: "block", fontSize: 11, lineHeight: 1.35 }}>
                          {image.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedImage && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
                        Background Opacity
                      </span>
                      <input
                        type="range"
                        min="16"
                        max="58"
                        step="1"
                        value={backgroundOpacity}
                        onChange={(event) => setBackgroundOpacity(parseInt(event.target.value, 10) || 36)}
                      />
                    </label>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ color: "var(--text-light)", fontSize: 12 }}>
                        {backgroundOpacity}% opacity
                      </div>
                      {selectedImage.pageUrl && (
                        <a className="btn btn-ghost btn-sm" href={selectedImage.pageUrl} target="_blank" rel="noopener noreferrer">
                          Source Page
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div
            style={{
              ...preview,
              borderRadius: 20,
              padding: "32px 34px 28px",
              minHeight: 420,
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 18px 44px rgba(0,0,0,0.08)",
            }}
          >
            {selectedImage && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url("${selectedImage.imageUrl}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: backgroundOpacity / 100,
                }}
              />
            )}
            {selectedImage && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: preview.background,
                  opacity: 0.7,
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                left: 20,
                top: 6,
                fontSize: 128,
                lineHeight: 1,
                color: preview.quoteMark,
                fontFamily: preview.quoteFont,
                opacity: 0.55,
                pointerEvents: "none",
              }}
            >
              "
            </div>
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 360,
              }}
            >
              <div style={{ paddingTop: 28 }}>
                {quoteLines.map((line, index) => (
                  <div
                    key={`${index}-${line}`}
                    style={{
                      fontFamily: preview.quoteFont,
                      fontSize: quoteLines.join(" ").length > 260 ? 28 : quoteLines.join(" ").length > 150 ? 34 : 40,
                      lineHeight: 1.42,
                      marginBottom: line ? 8 : 16,
                      color: preview.color,
                    }}
                  >
                    {line || "\u00A0"}
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: 20, borderTop: `1px solid ${preview.accent}33` }}>
                <div style={{ fontFamily: preview.titleFont, letterSpacing: 2, textTransform: "uppercase", fontSize: 14, color: preview.accent, marginBottom: 8 }}>
                  {quote.title}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ color: preview.muted, fontFamily: preview.metaFont, fontSize: 14 }}>
                    {quote.author}
                    {quote.citation ? ` - ${quote.citation}` : ""}
                  </div>
                  <div style={{ color: preview.muted, fontFamily: preview.metaFont, fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
                    Codex Lector
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
              Citation
            </div>
            <div style={{ color: "var(--text-muted)", lineHeight: 1.55 }}>
              {quote.author} - <strong>{quote.title}</strong>{quote.citation ? ` - ${quote.citation}` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={copyText}>
              Copy Quote
            </button>
            <button className="btn btn-primary" onClick={downloadPng} disabled={busy === "png"}>
              {busy === "png" ? "Rendering PNG..." : "Download PNG"}
            </button>
            <button className="btn btn-secondary" onClick={downloadSvg} disabled={busy === "svg"}>
              {busy === "svg" ? "Preparing SVG..." : "Download SVG"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
