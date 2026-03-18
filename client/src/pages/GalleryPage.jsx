import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { gallery as galleryApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

export default function GalleryPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [loading, setLoading] = useState(true);
  const [works, setWorks] = useState([]);
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedWork, setSelectedWork] = useState(() => searchParams.get("work") || "");
  const [selectedTag, setSelectedTag] = useState(() => searchParams.get("tag") || "");
  const [query, setQuery] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    setSelectedWork(searchParams.get("work") || "");
    setSelectedTag(searchParams.get("tag") || "");
    setQuery(searchParams.get("q") || "");
  }, [searchParamsKey, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (selectedWork) nextParams.set("work", selectedWork);
    if (selectedTag) nextParams.set("tag", selectedTag);
    if (query) nextParams.set("q", query);
    const next = nextParams.toString();
    const current = searchParamsKey;
    if (next !== current) setSearchParams(nextParams, { replace: true });
  }, [query, searchParamsKey, selectedTag, selectedWork, setSearchParams]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    galleryApi.list({ workSlug: selectedWork, tag: selectedTag, q: query, limit: 240 })
      .then((data) => {
        if (ignore) return;
        setWorks(data?.works || []);
        setItems(data?.items || []);
        setTags(data?.tags || []);
      })
      .catch((error) => {
        if (ignore) return;
        toast?.error(error?.message || "Could not load gallery.");
        setWorks([]);
        setItems([]);
        setTags([]);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [query, selectedTag, selectedWork, toast]);

  const visibleTags = useMemo(
    () => tags.filter((tag) => !tag.tag.startsWith("slug:") && !tag.tag.startsWith("work:") && !tag.tag.startsWith("source:")).slice(0, 18),
    [tags],
  );

  return (
    <div className="animate-in" style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 24px 40px" }}>
      <div style={{ maxWidth: 760, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          Commons Gallery
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1.2 }}>
          Shakespeare Art Gallery
        </h1>
        <p style={{ margin: "12px 0 0", color: "var(--text-muted)", lineHeight: 1.7, fontSize: 15 }}>
          Open-source Shakespeare artwork organized for reuse across Codex Lector. Filter by work now; character tags, source groupings, and quote-card backgrounds can build on the same gallery over time.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 2fr) auto", gap: 10, marginBottom: 16 }}>
        <select className="input" value={selectedWork} onChange={(event) => setSelectedWork(event.target.value)}>
          <option value="">All works</option>
          {works.map((work) => (
            <option key={work.workSlug || work.workTitle} value={work.workSlug}>
              {work.workTitle}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search image title or work…"
        />
        <button
          className="btn btn-secondary"
          onClick={() => {
            setSelectedWork("");
            setSelectedTag("");
            setQuery("");
          }}
        >
          Reset
        </button>
      </div>

      {visibleTags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button className={selectedTag ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"} onClick={() => setSelectedTag("")}>
            All tags
          </button>
          {visibleTags.map((tag) => (
            <button
              key={tag.tag}
              className={selectedTag === tag.tag ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => setSelectedTag(tag.tag)}
            >
              {tag.tag.replace(/^category:/, "")} ({tag.count})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: "center" }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: 28, border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)", color: "var(--text-muted)", lineHeight: 1.7 }}>
          No gallery images match the current filters yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {items.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid var(--border-light)",
                borderRadius: 16,
                overflow: "hidden",
                background: "var(--surface)",
                boxShadow: "0 16px 34px rgba(0,0,0,0.05)",
              }}
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                loading="lazy"
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }}
              />
              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--accent)", lineHeight: 1.35, marginBottom: 6 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: 1.1 }}>
                    {item.workTitle}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.workSlug && (
                    <Link className="btn btn-ghost btn-sm" to={`/read/${item.workSlug}`}>
                      Open Work
                    </Link>
                  )}
                  {item.pageUrl && (
                    <a className="btn btn-secondary btn-sm" href={item.pageUrl} target="_blank" rel="noopener noreferrer">
                      Source
                    </a>
                  )}
                </div>

                {item.tags?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {item.tags
                      .filter((tag) => !tag.startsWith("slug:") && !tag.startsWith("work:") && !tag.startsWith("source:"))
                      .slice(0, 4)
                      .map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "var(--bg)",
                            border: "1px solid var(--border-light)",
                            fontSize: 11,
                            color: "var(--text-light)",
                          }}
                        >
                          {tag.replace(/^category:/, "")}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
