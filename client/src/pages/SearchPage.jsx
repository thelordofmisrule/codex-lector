import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { works as api } from "../lib/api";
import { useToast } from "../lib/ToastContext";

export default function SearchPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.searchText(query.trim());
      setResults(r);
    } catch (e) {
      console.error(e);
      setResults(null);
      setError(e.message || "Search failed.");
      toast?.error(e.message || "Search failed. Please try again.");
    }
    setLoading(false);
  };

  const totalMatches = results ? results.reduce((s, r) => s + r.matches.length, 0) : 0;

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px" }}>
      <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>Text Search</h1>
      <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15, marginBottom:24 }}>
        Search within the text of all Shakespeare's works.
      </p>

      <div style={{ display:"flex", gap:8, marginBottom:24 }}>
        <input className="input" value={query} onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&search()}
          placeholder="Enter a word or phrase…" style={{ flex:1 }} />
        <button className="btn btn-primary" onClick={search} disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </div>

      {results !== null && (
        <div style={{ fontSize:14, color:"var(--text-light)", marginBottom:16 }}>
          {totalMatches > 0
            ? `Found ${totalMatches} match${totalMatches===1?"":"es"} across ${results.length} work${results.length===1?"":"s"}.`
            : `No matches for "${query}".`}
        </div>
      )}

      {error && (
        <div style={{ background:"var(--surface)", border:"1px solid var(--danger)", borderRadius:8, padding:"14px 16px", marginBottom:16 }}>
          <div style={{ color:"var(--danger)", marginBottom:8 }}>{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={search}>Try Again</button>
        </div>
      )}

      {results?.map(r => (
        <div key={r.slug} style={{ background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, padding:"16px 20px", marginBottom:12 }}>
          <button className="btn btn-ghost" onClick={()=>nav(`/read/${r.slug}`)}
            style={{ fontFamily:"var(--font-display)", fontSize:17, fontWeight:500, color:"var(--accent)", padding:0, marginBottom:8 }}>
            {r.title}
          </button>
          <div style={{ fontSize:12, color:"var(--text-light)", marginBottom:8, textTransform:"capitalize" }}>{r.category} · {r.matches.length} match{r.matches.length===1?"":"es"}</div>
          {r.matches.map((m, i) => {
            // Highlight the query in the snippet
            const idx = m.snippet.toLowerCase().indexOf(query.toLowerCase());
            return (
              <div key={i} style={{ fontSize:14, lineHeight:1.6, color:"var(--text-muted)", padding:"4px 0", borderTop: i>0?"1px solid var(--border-light)":"none" }}>
                {idx >= 0 ? (
                  <>
                    {m.snippet.slice(0, idx)}
                    <mark style={{ background:"var(--gold-faint)", color:"var(--gold)", fontWeight:500, padding:"1px 2px", borderRadius:2 }}>
                      {m.snippet.slice(idx, idx + query.length)}
                    </mark>
                    {m.snippet.slice(idx + query.length)}
                  </>
                ) : m.snippet}
              </div>
            );
          })}
        </div>
      ))}

      {/* Helpful tools section */}
      <div className="tudor-rule" />
      <h3 style={{ fontFamily:"var(--font-display)", fontSize:16, color:"var(--text-muted)", letterSpacing:2, marginBottom:12 }}>Reader's Tools</h3>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <a href="https://www.opensourceshakespeare.org/concordance/" target="_blank" rel="noopener"
          style={{ background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, padding:16, textDecoration:"none" }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--accent)", marginBottom:4 }}>Shakespeare Concordance</div>
          <div style={{ fontSize:13, color:"var(--text-light)" }}>Look up every occurrence of any word across the canon.</div>
        </a>
        <a href="https://www.shakespeareswords.com/" target="_blank" rel="noopener"
          style={{ background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, padding:16, textDecoration:"none" }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--accent)", marginBottom:4 }}>Shakespeare's Words</div>
          <div style={{ fontSize:13, color:"var(--text-light)" }}>Glossary and language companion by David Crystal.</div>
        </a>
        <a href="https://www.folger.edu/explore/shakespeares-works/" target="_blank" rel="noopener"
          style={{ background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, padding:16, textDecoration:"none" }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--accent)", marginBottom:4 }}>Folger Shakespeare Library</div>
          <div style={{ fontSize:13, color:"var(--text-light)" }}>Scholarly editions with notes and performance history.</div>
        </a>
        <a href="https://www.lexically.net/wordsmith/support/shakespeare.html" target="_blank" rel="noopener"
          style={{ background:"var(--surface)", border:"1px solid var(--border-light)", borderRadius:8, padding:16, textDecoration:"none" }}>
          <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--accent)", marginBottom:4 }}>Words Shakespeare Invented</div>
          <div style={{ fontSize:13, color:"var(--text-light)" }}>Catalogue of coinages and first attestations.</div>
        </a>
      </div>
    </div>
  );
}
