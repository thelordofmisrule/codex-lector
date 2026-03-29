import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { layoutNextLine, prepareWithSegments, walkLineRanges } from "@chenglou/pretext";
import { sourceTexts as sourceTextsApi } from "../lib/api";
import { getBookshelfSourceById, getBookshelfWorksForSource } from "../lib/shakespeareBookshelf";
import { parseSourceTextXML } from "../lib/sourceTextParser";

const PRINT_BODY_FONT_SIZE = 20;
const PRINT_LINE_HEIGHT = 33;
const PRINT_DROP_CAP_LINES = 4;
const PRINT_DROP_CAP_GAP = 16;
const PRINT_NOTE_FONT_SIZE = 14;
const PRINT_NOTE_LINE_HEIGHT = 20;
const PRINT_NOTE_TOP = 38;
const PRINT_NOTE_GAP = 18;
const PRINT_NOTE_BOX_CHROME = 42;
const PRINT_NOTE_MAX_TOP = 320;
const PRINT_BODY_FONT = `${PRINT_BODY_FONT_SIZE}px "IM Fell English"`;
const PRINT_DROP_CAP_FONT = `700 ${Math.round(PRINT_LINE_HEIGHT * 4.1)}px "Cinzel Decorative"`;
const PRINT_NOTE_FONT = `600 ${PRINT_NOTE_FONT_SIZE}px "Cormorant Garamond"`;

function metaBadgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--border-light)",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text)",
    fontFamily: "var(--font-display)",
    background: "var(--surface-hover)",
  };
}

function SourceDropCap({ letter, inline = false }) {
  if (!letter) return null;
  return (
    <span className={`source-text-dropcap${inline ? " source-text-dropcap-inline" : ""}`}>
      {letter}
    </span>
  );
}

function SourceParagraph({ text, decorativeInitial }) {
  return (
    <p
      className={decorativeInitial ? "source-text-paragraph source-text-paragraph-dropcap" : "source-text-paragraph"}
      style={{ margin: "0 0 18px", color: "var(--text)", lineHeight: 1.9, fontSize: 17 }}
    >
      {decorativeInitial && <SourceDropCap letter={decorativeInitial} />}
      {text}
    </p>
  );
}

function isCollapsibleContentsSection(section) {
  const joined = [section?.title, ...(section?.path || [])].filter(Boolean).join(" ");
  return /table of|contents?/i.test(joined);
}

function findPrintModeCandidate(parsed) {
  if (!parsed?.sections?.length) return null;

  for (const section of parsed.sections) {
    for (let blockIndex = 0; blockIndex < (section.blocks || []).length; blockIndex += 1) {
      const block = section.blocks[blockIndex];
      if (
        block?.type === "paragraph"
        && block.decorativeInitial
        && String(block.text || "").trim().length >= 120
      ) {
        return {
          sectionKey: section.key,
          blockIndex,
          decorativeInitial: block.decorativeInitial,
          text: block.text,
        };
      }
    }
  }

  return null;
}

function SourcePrintOpening({ decorativeInitial, text, relatedWorks, bookshelfSource }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [noteTop, setNoteTop] = useState(PRINT_NOTE_TOP);
  const [noteDragging, setNoteDragging] = useState(false);
  const [layout, setLayout] = useState({
    lines: [],
    height: PRINT_DROP_CAP_LINES * PRINT_LINE_HEIGHT,
    noteWidth: 0,
    noteHeight: 0,
    noteLines: [],
    ready: false,
  });

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return undefined;

    const updateWidth = () => {
      const styles = window.getComputedStyle(element);
      const horizontalPadding = (parseFloat(styles.paddingLeft || "0") || 0) + (parseFloat(styles.paddingRight || "0") || 0);
      setFrameWidth(Math.max(0, element.clientWidth - horizontalPadding));
    };

    updateWidth();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateWidth) : null;
    observer?.observe(element);
    window.addEventListener("resize", updateWidth);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current) return;
      const nextTop = dragRef.current.startTop + (event.clientY - dragRef.current.startY);
      setNoteTop(Math.max(0, Math.min(PRINT_NOTE_MAX_TOP, nextTop)));
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      setNoteDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function buildLayout() {
      if (!frameWidth || !text || !decorativeInitial) {
        if (!ignore) {
          setLayout({
            lines: [],
            height: PRINT_DROP_CAP_LINES * PRINT_LINE_HEIGHT,
            noteWidth: 0,
            noteHeight: 0,
            noteLines: [],
            ready: false,
          });
        }
        return;
      }

      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Ignore font readiness failures and attempt layout anyway.
        }
      }

      const preparedBody = prepareWithSegments(text, PRINT_BODY_FONT);
      const preparedDropCap = prepareWithSegments(decorativeInitial, PRINT_DROP_CAP_FONT);
      const noteLabel = relatedWorks.slice(0, 3).map((work) => work.title).join(" · ") || bookshelfSource?.title || "Bookshelf source";
      const noteText = bookshelfSource?.author
        ? `${bookshelfSource.author}. ${noteLabel}`
        : noteLabel;
      const preparedNote = prepareWithSegments(noteText, PRINT_NOTE_FONT);
      let dropCapWidth = 0;

      walkLineRanges(preparedDropCap, 9999, (line) => {
        dropCapWidth = Math.max(dropCapWidth, line.width);
      });

      const insetWidth = Math.min(
        Math.max(92, Math.ceil(dropCapWidth) + 8),
        Math.max(92, Math.floor(frameWidth * 0.26)),
      );
      const noteWidth = Math.min(
        Math.max(180, Math.floor(frameWidth * 0.27)),
        Math.max(180, Math.floor(frameWidth * 0.34)),
      );
      const noteLines = [];
      let noteHeight = 0;
      walkLineRanges(preparedNote, noteWidth - 24, () => {
        noteHeight += PRINT_NOTE_LINE_HEIGHT;
      });
      let noteCursor = { segmentIndex: 0, graphemeIndex: 0 };
      while (true) {
        const line = layoutNextLine(preparedNote, noteCursor, noteWidth - 24);
        if (line === null) break;
        noteLines.push(line.text);
        noteCursor = line.end;
      }
      const noteBoxHeight = noteHeight + PRINT_NOTE_BOX_CHROME;

      const lines = [];
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      let lineIndex = 0;

      while (true) {
        const lineTop = lineIndex * PRINT_LINE_HEIGHT;
        const leftInset = lineIndex < PRINT_DROP_CAP_LINES ? insetWidth : 0;
        const noteActive = lineTop + PRINT_LINE_HEIGHT > noteTop
          && lineTop < noteTop + noteBoxHeight;
        const rightInset = noteActive ? noteWidth + PRINT_NOTE_GAP : 0;
        const availableWidth = Math.max(160, frameWidth - leftInset - rightInset);
        const line = layoutNextLine(preparedBody, cursor, availableWidth);
        if (line === null) break;
        lines.push({
          text: line.text,
          top: lineTop,
          left: leftInset,
        });
        cursor = line.end;
        lineIndex += 1;
      }

      if (!ignore) {
        setLayout({
          lines,
          height: Math.max(
            lineIndex * PRINT_LINE_HEIGHT,
            PRINT_DROP_CAP_LINES * PRINT_LINE_HEIGHT,
            noteTop + noteBoxHeight,
          ),
          noteWidth,
          noteHeight: noteBoxHeight,
          noteLines,
          ready: true,
        });
      }
    }

    buildLayout();
    return () => {
      ignore = true;
    };
  }, [decorativeInitial, frameWidth, noteTop, text]);

  const runningHead = relatedWorks?.[0]?.title || bookshelfSource?.title || "Source Shelf";

  return (
    <section className="source-text-print-mode">
      <div className="source-text-print-meta">
        <span>Print Mode</span>
        <span>Experimental composition with Pretext</span>
      </div>
      <div className="source-text-print-frame" ref={frameRef}>
        <div className="source-text-print-running-head">
          {bookshelfSource?.author || "Bookshelf Source"} · {runningHead}
        </div>
        <div className="source-text-print-rule" />
        <div
          className="source-text-print-body"
          style={{ minHeight: layout.height }}
        >
          <div className="source-text-print-dropcap">
            {decorativeInitial}
          </div>
          {layout.ready && layout.noteLines.length > 0 && (
            <aside
              className="source-text-print-note"
              style={{ top: noteTop, width: layout.noteWidth, cursor: noteDragging ? "grabbing" : "grab" }}
              onPointerDown={(event) => {
                dragRef.current = { startY: event.clientY, startTop: noteTop };
                setNoteDragging(true);
                event.preventDefault();
              }}
            >
              <div className="source-text-print-note-kicker">Marginal Note · Drag</div>
              {layout.noteLines.map((line, index) => (
                <div key={`print-note-line-${index}`} className="source-text-print-note-line">
                  {line}
                </div>
              ))}
            </aside>
          )}
          {layout.ready ? (
            layout.lines.map((line, index) => (
              <div
                key={`print-line-${index}`}
                className="source-text-print-line"
                style={{ top: line.top, left: line.left }}
              >
                {line.text}
              </div>
            ))
          ) : (
            <div className="source-text-print-fallback">
              <SourceParagraph text={text} decorativeInitial={decorativeInitial} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RenderBlocks({
  blocks,
  printMode = false,
  printCandidate = null,
  sectionKey = "",
  relatedWorks = [],
  bookshelfSource = null,
}) {
  return (blocks || []).map((block, index) => {
    const isPrintOpening = Boolean(
      printMode
      && printCandidate
      && sectionKey === printCandidate.sectionKey
      && index === printCandidate.blockIndex
      && block?.type === "paragraph",
    );

    if (block.type === "verse") {
      return (
        <div key={`verse-${index}`} style={{ marginBottom: 18, paddingLeft: 14, borderLeft: "2px solid var(--border-light)" }}>
          {block.lines.map((line, lineIndex) => {
            const text = typeof line === "string" ? line : line?.text || "";
            const decorativeInitial = typeof line === "string" ? "" : line?.decorativeInitial || "";
            return (
              <div key={`line-${lineIndex}`} style={{ fontFamily: "var(--font-fell)", fontSize: 18, lineHeight: 1.75, color: "var(--text)" }}>
                {decorativeInitial && <SourceDropCap letter={decorativeInitial} inline />}
                {text}
              </div>
            );
          })}
        </div>
      );
    }

    if (block.type === "list") {
      return (
        <ul key={`list-${index}`} style={{ margin: "0 0 18px 20px", color: "var(--text)", lineHeight: 1.8 }}>
          {block.items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`} style={{ marginBottom: 6 }}>{item}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "speech") {
      return (
        <div key={`speech-${index}`} style={{ marginBottom: 18, padding: "14px 16px", background: "var(--bg-soft)", borderRadius: 12, border: "1px solid var(--border-light)" }}>
          {block.speaker && (
            <div style={{ fontSize: 12, letterSpacing: 1.8, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              {block.speaker}
            </div>
          )}
          <RenderBlocks blocks={block.blocks} />
        </div>
      );
    }

    if (isPrintOpening) {
      return (
        <SourcePrintOpening
          key={`print-opening-${sectionKey}-${index}`}
          decorativeInitial={block.decorativeInitial}
          text={block.text}
          relatedWorks={relatedWorks}
          bookshelfSource={bookshelfSource}
        />
      );
    }

    return <SourceParagraph key={`paragraph-${index}`} text={block.text} decorativeInitial={block.decorativeInitial} />;
  });
}

export default function SourceTextPage() {
  const { identifier = "" } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [printMode, setPrintMode] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError("");
    sourceTextsApi.get(identifier)
      .then((data) => {
        if (!ignore) setEntry(data);
      })
      .catch((err) => {
        if (!ignore) {
          setEntry(null);
          setError(err.message || "Could not load source text.");
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [identifier]);

  const parsed = useMemo(() => {
    if (!entry?.xml) return null;
    return parseSourceTextXML(entry.xml);
  }, [entry]);
  const bookshelfSource = getBookshelfSourceById(entry?.source_id);
  const relatedWorks = getBookshelfWorksForSource(entry?.source_id);
  const printCandidate = useMemo(() => findPrintModeCandidate(parsed), [parsed]);

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" /></div>;
  }

  if (error || !entry) {
    return (
      <div className="animate-in" style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 80px" }}>
        <h1 style={{ margin: "0 0 12px", fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 400, color: "var(--accent)" }}>
          Source text not found
        </h1>
        <p style={{ color: "var(--text)", lineHeight: 1.8, marginBottom: 18 }}>
          {error || "We could not find that EEBO-TCP source text in the local database yet."}
        </p>
        <Link className="btn btn-primary" to="/bookshelf">
          Back to Bookshelf
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ maxWidth: 980, margin: "0 auto", padding: "48px 24px 88px" }}>
      <div style={{ marginBottom: 26, textAlign: "center" }}>
        <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          EEBO-TCP Source Text
        </div>
        <h1 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 400, color: "var(--accent)", lineHeight: 1.2 }}>
          {entry.title}
        </h1>
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", fontSize: 18, marginBottom: 12 }}>
          {entry.author || bookshelfSource?.author || "Unknown author"}
          {entry.date_label ? ` · ${entry.date_label}` : ""}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={metaBadgeStyle()}>TCP {entry.tcp_id}</span>
          {entry.language && <span style={metaBadgeStyle()}>{entry.language}</span>}
          {bookshelfSource && <span style={metaBadgeStyle()}>{bookshelfSource.shelfType}</span>}
          {printCandidate && <span style={metaBadgeStyle()}>Print mode available</span>}
        </div>
        {entry.publication && (
          <div style={{ color: "var(--text)", lineHeight: 1.8, maxWidth: 760, margin: "0 auto 16px" }}>
            {entry.publication}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" to="/bookshelf">
            Back to Bookshelf
          </Link>
          {bookshelfSource && (
            <Link className="btn btn-secondary" to="/bookshelf">
              Source Shelf
            </Link>
          )}
        </div>
      </div>

      {relatedWorks.length > 0 && (
        <section style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, marginBottom: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            Related Shakespeare Works
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {relatedWorks.map((work) => (
              <Link key={work.slug} className="btn btn-secondary btn-sm" to={`/read/${work.slug}`}>
                {work.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      {entry.alternatives?.length > 0 && (
        <section style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, marginBottom: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            Other Local Witnesses
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {entry.alternatives.map((item) => (
              <Link key={item.slug} className="btn btn-secondary btn-sm" to={`/source-texts/${item.slug}`}>
                {item.tcp_id}{item.date_label ? ` · ${item.date_label}` : ""}
              </Link>
            ))}
          </div>
        </section>
      )}

      {printCandidate && (
        <section style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                Experimental Print Mode
              </div>
              <div style={{ color: "var(--text)", lineHeight: 1.8, maxWidth: 700 }}>
                Recompose the first ornamental opening with Pretext so the paragraph truly wraps around the decorated initial like a printed page instead of a normal web block.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={printMode ? "btn btn-secondary" : "btn btn-primary"}
                onClick={() => setPrintMode(false)}
              >
                Diplomatic View
              </button>
              <button
                className={printMode ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setPrintMode(true)}
              >
                Print Mode
              </button>
            </div>
          </div>
        </section>
      )}

      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", marginBottom: 20, lineHeight: 1.8 }}>
        This is a diplomatic EEBO-TCP transcription shown with light structural cleanup for reading. Spelling and punctuation remain early modern.
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {(parsed?.sections || []).map((section) => (
          isCollapsibleContentsSection(section) ? (
            <details
              key={section.key}
              style={{ padding: 22, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 16 }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                  {section.path.join(" · ")}
                </div>
                <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, color: "var(--accent)" }}>
                  {section.title}
                </h2>
                <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic" }}>
                  {section.blocks.length} content block{section.blocks.length === 1 ? "" : "s"} hidden
                </div>
              </summary>
              <div style={{ marginTop: 18 }}>
                <RenderBlocks
                  blocks={section.blocks}
                  printMode={printMode}
                  printCandidate={printCandidate}
                  sectionKey={section.key}
                  relatedWorks={relatedWorks}
                  bookshelfSource={bookshelfSource}
                />
              </div>
            </details>
          ) : (
            <section key={section.key} style={{ padding: 22, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 16 }}>
              <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                {section.path.join(" · ")}
              </div>
              <h2 style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, color: "var(--accent)" }}>
                {section.title}
              </h2>
              <RenderBlocks
                blocks={section.blocks}
                printMode={printMode}
                printCandidate={printCandidate}
                sectionKey={section.key}
                relatedWorks={relatedWorks}
                bookshelfSource={bookshelfSource}
              />
            </section>
          )
        ))}
      </div>
    </div>
  );
}
