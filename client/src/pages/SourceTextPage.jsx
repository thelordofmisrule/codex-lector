import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sourceTexts as sourceTextsApi } from "../lib/api";
import { getBookshelfSourceById, getBookshelfWorksForSource } from "../lib/shakespeareBookshelf";
import { parseSourceTextXML } from "../lib/sourceTextParser";

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

function RenderBlocks({ blocks }) {
  return (blocks || []).map((block, index) => {
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

    return <SourceParagraph key={`paragraph-${index}`} text={block.text} decorativeInitial={block.decorativeInitial} />;
  });
}

export default function SourceTextPage() {
  const { identifier = "" } = useParams();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", marginBottom: 20, lineHeight: 1.8 }}>
        This is a diplomatic EEBO-TCP transcription shown with light structural cleanup for reading. Spelling and punctuation remain early modern.
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {(parsed?.sections || []).map((section) => (
          <section key={section.key} style={{ padding: 22, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 16 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              {section.path.join(" · ")}
            </div>
            <h2 style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400, color: "var(--accent)" }}>
              {section.title}
            </h2>
            <RenderBlocks blocks={section.blocks} />
          </section>
        ))}
      </div>
    </div>
  );
}
