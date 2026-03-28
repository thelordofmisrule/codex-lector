import { Link, useSearchParams } from "react-router-dom";
import {
  BOOKSHELF_LOCAL_XML_COUNT,
  BOOKSHELF_SOURCE_COUNT,
  BOOKSHELF_WORKS,
  getBookshelfEntryForWork,
  getBookshelfSourcesForWork,
  getBookshelfWorksByCategory,
  getCrosscuttingBookshelfSources,
} from "../lib/shakespeareBookshelf";

function badgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "var(--text-light)",
    fontFamily: "var(--font-display)",
    background: "rgba(255,255,255,0.4)",
  };
}

function SourceMeta({ source }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <span style={badgeStyle()}>{source.shelfType}</span>
      {source.localXml && <span style={badgeStyle()}>Local EEBO XML</span>}
      {source.tcpIds?.length > 0 && (
        <span style={badgeStyle()}>
          TCP {source.tcpIds.join(", ")}
        </span>
      )}
    </div>
  );
}

function SourceCard({ source, note }) {
  return (
    <section
      style={{
        padding: 20,
        background: "var(--surface)",
        border: "1px solid var(--border-light)",
        borderRadius: 14,
        boxShadow: "0 10px 24px var(--shadow)",
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
        Source Book
      </div>
      <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", fontWeight: 400 }}>
        {source.title}
      </h2>
      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", marginBottom: 10 }}>
        {source.author} {source.dateLabel ? `· ${source.dateLabel}` : ""}
      </div>
      <div style={{ color: "var(--text)", lineHeight: 1.8, marginBottom: note ? 10 : 0 }}>
        {source.description}
      </div>
      {note && (
        <div style={{ color: "var(--text)", lineHeight: 1.8, padding: "10px 12px", borderLeft: "3px solid var(--gold)", background: "rgba(201,168,76,0.08)" }}>
          {note}
        </div>
      )}
      <SourceMeta source={source} />
    </section>
  );
}

function WorkSummaryCard({ entry }) {
  const sourceTitles = getBookshelfSourcesForWork(entry.slug).map((item) => item.source.title);

  return (
    <section
      style={{
        padding: 18,
        background: "var(--surface)",
        border: "1px solid var(--border-light)",
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 400, color: "var(--accent)" }}>
          {entry.title}
        </h3>
        <Link className="btn btn-secondary btn-sm" to={`/bookshelf?work=${encodeURIComponent(entry.slug)}`}>
          Open Bookshelf
        </Link>
      </div>
      <div style={{ color: "var(--text)", lineHeight: 1.8, marginBottom: 12 }}>
        {entry.summary}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sourceTitles.map((title) => (
          <span key={`${entry.slug}-${title}`} style={badgeStyle()}>
            {title}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function BookshelfPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = searchParams.get("work") || "";
  const selectedEntry = getBookshelfEntryForWork(selectedSlug);
  const selectedSources = selectedEntry ? getBookshelfSourcesForWork(selectedEntry.slug) : [];
  const groupedWorks = getBookshelfWorksByCategory();
  const crosscuttingSources = getCrosscuttingBookshelfSources();

  const setSelectedWork = (value) => {
    if (!value) {
      setSearchParams({});
      return;
    }
    setSearchParams({ work: value });
  };

  return (
    <div className="animate-in" style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px 84px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontFamily: "var(--font-display)", color: "var(--gold)", letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>
          Source Shelf
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 400, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
          Shakespeare's Bookshelf
        </h1>
        <p style={{ fontFamily: "var(--font-fell)", fontSize: 18, fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.8, maxWidth: 760, margin: "0 auto 18px" }}>
          A first pass at the books, chronicles, poems, plays, and other witnesses that fed Shakespeare's own works, organized by the Codex Lector text they helped shape.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={badgeStyle()}>{BOOKSHELF_WORKS.length} Shakespeare works mapped</span>
          <span style={badgeStyle()}>{BOOKSHELF_SOURCE_COUNT} source texts and traditions</span>
          <span style={badgeStyle()}>{BOOKSHELF_LOCAL_XML_COUNT} local EEBO-TCP XML texts already identified</span>
        </div>
      </div>

      <section style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border-light)", borderRadius: 14, marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ minWidth: 240, flex: "1 1 260px" }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
              Filter by Shakespeare work
            </div>
            <select
              value={selectedEntry?.slug || ""}
              onChange={(event) => setSelectedWork(event.target.value)}
              style={{
                width: "100%",
                maxWidth: 420,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 15,
              }}
            >
              <option value="">All mapped works</option>
              {BOOKSHELF_WORKS.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.title}
                </option>
              ))}
            </select>
          </div>
          {selectedEntry && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" to={`/read/${selectedEntry.slug}`}>
                Read {selectedEntry.title}
              </Link>
              <button className="btn btn-secondary" onClick={() => setSelectedWork("")}>
                Show All Works
              </button>
            </div>
          )}
        </div>
      </section>

      {selectedEntry ? (
        <section>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              Filtered Bookshelf
            </div>
            <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 400, color: "var(--accent)" }}>
              {selectedEntry.title}
            </h2>
            <div style={{ color: "var(--text)", lineHeight: 1.85, maxWidth: 820 }}>
              {selectedEntry.summary}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {selectedSources.map(({ sourceId, source, note }) => (
              <SourceCard key={`${selectedEntry.slug}-${sourceId}`} source={source} note={note} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <section style={{ marginBottom: 34 }}>
            {groupedWorks.map((group) => (
              <div key={group.category} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
                  {group.category}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                  {group.works.map((entry) => (
                    <WorkSummaryCard key={entry.slug} entry={entry} />
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section>
            <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
              Recurring Shelf
            </div>
            <h2 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, color: "var(--accent)" }}>
              Books Shakespeare seems to have returned to again and again
            </h2>
            <p style={{ color: "var(--text)", lineHeight: 1.8, marginBottom: 16, maxWidth: 840 }}>
              Some books belong almost everywhere: the big chronicles, North's Plutarch, Ovid, the Bible, Montaigne, and a handful of English poets and story collections that keep surfacing across the plays and poems.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {crosscuttingSources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
