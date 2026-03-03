import { useEffect, useState } from "react";
import { analytics as analyticsApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../lib/AuthContext";

function StatCard({ label, value, note }) {
  return (
    <div style={{ padding:18, background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:10 }}>
      <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:2, color:"var(--text-light)", textTransform:"uppercase", marginBottom:8 }}>
        {label}
      </div>
      <div style={{ fontSize:30, fontFamily:"var(--font-display)", color:"var(--accent)", marginBottom:4 }}>
        {value}
      </div>
      <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.5 }}>
        {note}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user?.isAdmin) return;
    setLoading(true);
    analyticsApi.summary()
      .then(setStats)
      .catch((e) => toast?.error(e.message || "Could not load analytics."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user?.isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [user?.isAdmin]);

  return (
    <div className="animate-in" style={{ maxWidth:920, margin:"0 auto", padding:"40px 24px 80px" }}>
      {!user?.isAdmin ? (
        <div style={{ padding:28, textAlign:"center", background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, color:"var(--danger)" }}>
          Admin access required.
        </div>
      ) : (
        <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:12, marginBottom:20 }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:6 }}>Launch Analytics</h1>
          <p style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
            Core funnel metrics for the last 7 or 30 days.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
      </div>

      {loading && <div style={{ textAlign:"center", padding:30 }}><div className="spinner" /></div>}

      {!loading && stats && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
          <StatCard label="Work Views" value={stats.workViews7d} note="Total work page views in the last 7 days." />
          <StatCard label="Unique Readers" value={stats.uniqueReaders7d} note="Distinct logged-in or remembered visitors in the last 7 days." />
          <StatCard label="New Accounts" value={stats.accounts30d} note="Users who completed onboarding in the last 30 days." />
          <StatCard label="First Annotations" value={stats.firstAnnotations30d} note="Users who made their first annotation in the last 30 days." />
          <StatCard label="Returning Readers" value={stats.returningReaders7d} note="Readers active in the last 7 days who had viewed a work before that window." />
        </div>
      )}
        </>
      )}
    </div>
  );
}
