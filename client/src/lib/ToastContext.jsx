import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastCtx = createContext(null);

let idSeed = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message, type = "info", ttl = 3600) => {
    if (!message) return;
    const id = idSeed++;
    setToasts(prev => [...prev, { id, message, type }]);
    window.setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const api = useMemo(() => ({
    show,
    success: (msg) => show(msg, "success"),
    error: (msg) => show(msg, "error", 5000),
    info: (msg) => show(msg, "info"),
  }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div aria-live="polite" aria-atomic="true" style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 2500,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: "var(--surface)",
            border: `1px solid ${t.type === "error" ? "var(--danger)" : t.type === "success" ? "var(--success)" : "var(--border)"}`,
            borderLeft: `4px solid ${t.type === "error" ? "var(--danger)" : t.type === "success" ? "var(--success)" : "var(--accent)"}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px var(--shadow)",
            padding: "10px 12px",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}>
            <div style={{ flex: 1, color: "var(--text)", fontSize: 13, lineHeight: 1.45 }}>{t.message}</div>
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              style={{ padding: "0 4px", color: "var(--text-light)", lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

