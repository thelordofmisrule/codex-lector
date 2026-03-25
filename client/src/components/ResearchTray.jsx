import { useMemo } from "react";
import ReaderOverlayShell from "./ReaderOverlayShell";

const ITEM_META = {
  passage: { label: "Passage", icon: "§" },
  word: { label: "Word", icon: "Aa" },
  place: { label: "Place", icon: "◉" },
  annotation: { label: "Annotation", icon: "✎" },
};

function getItemMeta(type) {
  return ITEM_META[String(type || "").toLowerCase()] || { label: "Saved", icon: "•" };
}

export default function ResearchTray({
  open,
  items,
  mobileSheet = false,
  onClose,
  onOpenItem,
  onRemoveItem,
  onClear,
  onCopyItem,
}) {
  const sortedItems = useMemo(
    () => [...(Array.isArray(items) ? items : [])].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    [items],
  );

  if (!open) return null;

  const content = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--font-display)", letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 2 }}>
            Research Tray
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)", lineHeight: 1.2 }}>
            Saved Reading Fragments
          </div>
        </div>
        <button aria-label="Close research tray" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-light)", padding: "0 4px" }}>✕</button>
      </div>

      {sortedItems.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-fell)", fontStyle: "italic", lineHeight: 1.7 }}>
          Save words, places, passages, and notes from the reader to keep a working set while you read.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            {sortedItems.map((item) => {
              const meta = getItemMeta(item.type);
              return (
                <div key={item.id} style={{ border: "1px solid var(--border-light)", borderRadius: 10, background: "var(--surface)", padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--gold)", fontFamily: "var(--font-display)", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 4 }}>
                        {meta.icon} {meta.label}
                      </div>
                      <div style={{ fontSize: 15, color: "var(--text)", fontFamily: "var(--font-display)", lineHeight: 1.3 }}>
                        {item.title || item.workTitle || "Saved item"}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onRemoveItem?.(item.id)}
                      style={{ fontSize: 11, color: "var(--text-light)", padding: "0 4px" }}
                    >
                      Remove
                    </button>
                  </div>

                  {item.subtitle && (
                    <div style={{ fontSize: 12, color: "var(--text-light)", marginBottom: 6 }}>
                      {item.subtitle}
                    </div>
                  )}

                  {item.excerpt && (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, fontFamily: "var(--font-fell)" }}>
                      {item.excerpt}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => onOpenItem?.(item)}>
                      Open
                    </button>
                    {item.copyText && (
                      <button className="btn btn-secondary btn-sm" onClick={() => onCopyItem?.(item)}>
                        Copy
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
            <div style={{ fontSize: 12, color: "var(--text-light)" }}>
              {sortedItems.length} saved item{sortedItems.length === 1 ? "" : "s"}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClear} style={{ color: "var(--text-light)" }}>
              Clear Tray
            </button>
          </div>
        </>
      )}
    </>
  );

  if (mobileSheet) {
    return (
      <ReaderOverlayShell
        position={{ x: 0, y: 0 }}
        onClose={onClose}
        mobileSheet
        desktopWidth={360}
        maxMobileHeight="min(78vh, 640px)"
        deps={[sortedItems.length]}
      >
        {content}
      </ReaderOverlayShell>
    );
  }

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 169 }} />
      <aside
        style={{
          position: "fixed",
          top: 88,
          right: 16,
          bottom: 78,
          width: 320,
          zIndex: 170,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 18px 48px var(--shadow)",
          padding: 16,
          overflowY: "auto",
        }}
      >
        {content}
      </aside>
    </>
  );
}
