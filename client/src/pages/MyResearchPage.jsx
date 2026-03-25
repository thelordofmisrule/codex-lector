import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { researchTray as api } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

const TYPE_LABELS = {
  passage: "Passage",
  word: "Word",
  place: "Place",
  annotation: "Annotation",
};

function fmt(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function MyResearchPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.list(query)
      .then(setItems)
      .catch(() => toast?.error("Could not load your research tray."))
      .finally(() => setLoading(false));
  }, [query, toast, user]);

  const remove = async (id) => {
    const ok = await confirm({
      title: "Remove Research Item",
      message: "Remove this saved item from your research tray?",
      confirmText: "Remove",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const previous = items;
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await api.remove(id);
      toast?.success("Research item removed.");
    } catch (e) {
      setItems(previous);
      toast?.error(e.message || "Could not remove research item.");
    }
  };

  const clearAll = async () => {
    if (!items.length) return;
    const ok = await confirm({
      title: "Clear Research Tray",
      message: "Remove all saved items from your research tray?",
      confirmText: "Clear",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;
    const previous = items;
    setItems([]);
    try {
      await api.clear();
      toast?.success("Research tray cleared.");
    } catch (e) {
      setItems(previous);
      toast?.error(e.message || "Could not clear research tray.");
    }
  };

  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.copyText || item.excerpt || item.title || "");
      toast?.success("Research item copied.");
    } catch {
      toast?.error("Could not copy research item.");
    }
  };

  if (!user) return (
    <div className="animate-in" style={{ maxWidth: 600, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
      <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic" }}>
        Sign in to view your research tray across devices.
      </p>
    </div>
  );

  return (
    <div className="animate-in" style={{ maxWidth: 840, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: 2, marginBottom: 4 }}>My Research Tray</h1>
          <p style={{ fontFamily: "var(--font-fell)", fontStyle: "italic", color: "var(--text-muted)", fontSize: 15 }}>
            Saved words, places, passages, and notes from the reader.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved research…"
            style={{ minWidth: 240 }}
          />
          <button className="btn btn-ghost btn-sm" onClick={clearAll} style={{ color: "var(--text-light)" }}>
            Clear All
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", lineHeight: 1.8 }}>
          {query
            ? "No saved research items match that search."
            : "No research items yet. Save words, places, passages, or notes from the reader to build a working set."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "14px 18px",
                background: "var(--surface)",
                borderRadius: 10,
                border: "1px solid var(--border-light)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--font-display)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
                    {TYPE_LABELS[item.itemType] || "Saved"}{item.workTitle ? ` · ${item.workTitle}` : ""}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--accent)", lineHeight: 1.3 }}>
                    {item.title || "Untitled"}
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: 13, color: "var(--text-light)", marginTop: 2 }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(item.id)} style={{ color: "var(--text-light)" }}>
                  Remove
                </button>
              </div>

              {item.excerpt && (
                <div style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "var(--font-fell)", lineHeight: 1.7, marginBottom: 10 }}>
                  {item.excerpt}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, color: "var(--text-light)" }}>
                  Saved {fmt(item.updatedAt || item.createdAt)}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.href && (
                    <Link to={item.href} className="btn btn-secondary btn-sm">
                      Open
                    </Link>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => copy(item)}>
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
