import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../lib/ToastContext";
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

export default function QuoteCaptureModal({ quote, onClose }) {
  const toast = useToast();
  const modalRef = useRef(null);
  const [themeId, setThemeId] = useState(QUOTE_CAPTURE_THEMES[0].id);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setThemeId(QUOTE_CAPTURE_THEMES[0].id);
  }, [quote?.text, quote?.citation, quote?.title]);

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

  const payload = useMemo(() => ({
    text: quote?.text || "",
    title: quote?.title || "",
    citation: quote?.citation || "",
    author: quote?.author || "William Shakespeare",
    themeId,
  }), [quote, themeId]);

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
      downloadQuoteCardSvg(payload, buildFilename(quote.title, "svg"));
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
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        ref={modalRef}
        style={{
          width: "min(960px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "0 22px 48px rgba(0,0,0,0.22)",
          padding: 18,
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
