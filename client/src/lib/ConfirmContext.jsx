import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [pending, setPending] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      const opts = typeof options === "string" ? { message: options } : (options || {});
      setPending({
        title: opts.title || "Confirm Action",
        message: opts.message || "Are you sure?",
        confirmText: opts.confirmText || "Confirm",
        cancelText: opts.cancelText || "Cancel",
        danger: !!opts.danger,
        resolve,
      });
    });
  }, []);

  const close = useCallback((result) => {
    setPending(prev => {
      if (prev?.resolve) prev.resolve(result);
      return null;
    });
  }, []);

  const api = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmCtx.Provider value={api}>
      {children}
      {pending && (
        <>
          <div onClick={() => close(false)} style={{ position: "fixed", inset: 0, zIndex: 2600, background: "rgba(0,0,0,0.35)" }} />
          <div role="dialog" aria-modal="true" aria-label={pending.title} style={{
            position: "fixed",
            zIndex: 2601,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(420px, calc(100vw - 24px))",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 14px 40px var(--shadow)",
            padding: 18,
          }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--accent)", marginBottom: 8 }}>{pending.title}</div>
            <div style={{ color: "var(--text)", lineHeight: 1.6, fontSize: 14, marginBottom: 14 }}>{pending.message}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => close(false)}>{pending.cancelText}</button>
              <button className={`btn ${pending.danger ? "btn-secondary" : "btn-primary"}`} onClick={() => close(true)} style={pending.danger ? { borderColor: "var(--danger)", color: "var(--danger)" } : {}}>
                {pending.confirmText}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}

