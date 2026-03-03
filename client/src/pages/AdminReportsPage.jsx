import { useEffect, useState } from "react";
import { reports as reportsApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../lib/AuthContext";

function fmt(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

export default function AdminReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user?.isAdmin) return;
    setLoading(true);
    reportsApi.list()
      .then(setReports)
      .catch((e) => toast?.error(e.message || "Could not load reports."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [user?.isAdmin]);

  const resolve = async (id) => {
    try {
      await reportsApi.resolve(id);
      setReports(prev => prev.map(item => item.id === id ? {
        ...item,
        status:"resolved",
        resolvedAt:new Date().toISOString(),
      } : item));
      toast?.success("Report resolved.");
    } catch (e) {
      toast?.error(e.message || "Could not resolve report.");
    }
  };

  return (
    <div className="animate-in" style={{ maxWidth:920, margin:"0 auto", padding:"40px 24px 80px" }}>
      {!user?.isAdmin ? (
        <div style={{ padding:28, textAlign:"center", background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, color:"var(--danger)" }}>
          Admin access required.
        </div>
      ) : (
        <>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:6 }}>Moderation Reports</h1>
        <p style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
          Review flagged annotations, threads, and replies.
        </p>
      </div>

      {loading && <div style={{ textAlign:"center", padding:30 }}><div className="spinner" /></div>}

      {!loading && reports.length === 0 && (
        <div style={{ padding:28, textAlign:"center", background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, color:"var(--text-light)" }}>
          No reports right now.
        </div>
      )}

      {!loading && reports.map(item => (
        <div key={item.id} style={{ padding:16, marginBottom:10, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, marginBottom:6 }}>
            <div style={{ fontSize:14 }}>
              <strong style={{ color:"var(--accent)" }}>{item.targetType}</strong>
              <span style={{ marginLeft:8, color:"var(--text-light)" }}>#{item.targetId}</span>
              <span style={{ marginLeft:10, color:"var(--text-light)" }}>reported by {item.displayName}</span>
            </div>
            <span style={{
              fontSize:11,
              padding:"3px 8px",
              borderRadius:999,
              background:item.status === "open" ? "var(--accent-faint)" : "rgba(61,107,79,0.15)",
              color:item.status === "open" ? "var(--accent)" : "var(--success)",
              fontFamily:"var(--font-display)",
              letterSpacing:1,
            }}>
              {item.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize:13, color:"var(--text)" }}>
            <strong>Reason:</strong> {item.reason}
          </div>
          {item.details && (
            <div style={{ fontSize:13, color:"var(--text-muted)", marginTop:6, lineHeight:1.6 }}>
              {item.details}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
            <div style={{ fontSize:12, color:"var(--text-light)" }}>
              {fmt(item.createdAt)}
              {item.resolvedAt ? ` · Resolved ${fmt(item.resolvedAt)}` : ""}
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {item.targetLink && (
                <a className="btn btn-secondary btn-sm" href={item.targetLink}>Open</a>
              )}
              {item.status === "open" && (
                <button className="btn btn-primary btn-sm" onClick={() => resolve(item.id)}>
                  Resolve
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
        </>
      )}
    </div>
  );
}
