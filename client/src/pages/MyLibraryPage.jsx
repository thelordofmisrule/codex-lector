import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { progress as api, works as worksApi } from "../lib/api";

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short"}); } catch { return ""; } }

export default function MyLibraryPage() {
  const { user } = useAuth();
  const [prog, setProg] = useState([]);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([api.myAll(), worksApi.list()])
      .then(([p, w]) => { setProg(p); setWorks(w); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [user]);

  if (!user) return (
    <div className="animate-in" style={{ maxWidth:600, margin:"60px auto", padding:"0 24px", textAlign:"center" }}>
      <p style={{ color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>Sign in to track your reading progress.</p>
    </div>
  );

  // Build a map of progress by work slug
  const progMap = {};
  prog.forEach(p => { progMap[p.slug] = p; });

  // Separate into reading (has progress) and unstarted
  const reading = prog.filter(p => p.max_line_reached > 0).sort((a,b) => new Date(b.last_read_at) - new Date(a.last_read_at));
  const totalWorks = works.filter(w => w.has_content).length;
  const worksStarted = reading.length;
  const worksComplete = reading.filter(p => p.total_lines > 0 && p.max_line_reached >= p.total_lines * 0.9).length;

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px 80px" }}>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>My Library</h1>
      <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15, marginBottom:28 }}>
        Your reading journey through the works.
      </p>

      {/* Summary stats */}
      <div style={{ display:"flex", gap:12, marginBottom:32, flexWrap:"wrap" }}>
        {[
          { label:"Works Available", n:totalWorks, icon:"📚" },
          { label:"Started", n:worksStarted, icon:"📖" },
          { label:"Completed", n:worksComplete, icon:"✅" },
        ].map(s => (
          <div key={s.label} style={{ flex:"1 1 120px", padding:"14px 16px", background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)", textAlign:"center" }}>
            <div style={{ fontSize:24, marginBottom:2 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"var(--font-display)", color:"var(--accent)" }}>{s.n}</div>
            <div style={{ fontSize:11, color:"var(--text-light)", letterSpacing:1, textTransform:"uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Overall progress bar */}
      {totalWorks > 0 && (
        <div style={{ marginBottom:32 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-light)", marginBottom:4 }}>
            <span>Overall progress</span>
            <span>{worksStarted} of {totalWorks} works</span>
          </div>
          <div style={{ height:8, background:"var(--border-light)", borderRadius:4, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(worksStarted/totalWorks*100).toFixed(1)}%`, background:"var(--accent)", borderRadius:4, transition:"width 0.3s" }} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:"center" }}><div className="spinner"/></div>
      ) : reading.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic", lineHeight:1.8 }}>
          No reading progress yet. Open any work and start reading — your progress will be tracked automatically.
        </div>
      ) : (
        <>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:14, letterSpacing:3, color:"var(--accent)", textTransform:"uppercase", marginBottom:14, borderBottom:"1px solid var(--border-light)", paddingBottom:8 }}>
            Currently Reading
          </h2>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {reading.map(p => {
              const pct = p.total_lines > 0 ? Math.min(100, (p.max_line_reached / p.total_lines * 100)) : 0;
              const isComplete = pct >= 90;
              return (
                <Link key={p.slug} to={`/read/${p.slug}`} style={{
                  padding:"14px 18px", background:"var(--surface)", borderRadius:8,
                  border:"1px solid var(--border-light)", textDecoration:"none", color:"var(--text)",
                  display:"block", transition:"border-color 0.15s",
                }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border-light)"}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span style={{ fontFamily:"var(--font-display)", fontSize:16, color:"var(--accent)" }}>
                      {isComplete && "✅ "}{p.title}
                    </span>
                    <span style={{ fontSize:12, color:"var(--text-light)" }}>
                      {pct.toFixed(0)}% · {fmt(p.last_read_at)}
                    </span>
                  </div>
                  <div style={{ height:6, background:"var(--border-light)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:3, transition:"width 0.3s",
                      width:`${pct}%`,
                      background: isComplete ? "var(--success)" : "var(--accent)",
                    }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
