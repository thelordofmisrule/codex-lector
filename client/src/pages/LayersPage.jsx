import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { layers as api } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

function fmt(iso) { try { return new Date(iso).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); } catch { return ""; } }

export default function LayersPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [allLayers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tab, setTab] = useState("browse"); // browse | mine | subscribed

  useEffect(() => {
    api.list()
      .then(setLayers)
      .catch(() => toast?.error("Could not load layers. Please refresh."))
      .finally(() => setLoading(false));
  }, [toast]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.create(name.trim(), desc.trim());
      setCreating(false); setName(""); setDesc("");
      const data = await api.list();
      setLayers(data);
      toast?.success("Layer created.");
    } catch (e) {
      toast?.error(e.message || "Could not create layer.");
    }
  };

  const toggle = async (layer) => {
    try {
      if (layer.isSubscribed) { await api.unsubscribe(layer.id); }
      else { await api.subscribe(layer.id); }
      setLayers(prev => prev.map(l => l.id===layer.id ? {...l, isSubscribed:!l.isSubscribed, subscriberCount:l.subscriberCount+(l.isSubscribed?-1:1)} : l));
      toast?.success(layer.isSubscribed ? "Unsubscribed from layer." : "Subscribed to layer.");
    } catch (e) {
      toast?.error(e.message || "Could not update subscription.");
    }
  };

  const publish = async (layer) => {
    try {
      await api.update(layer.id, { isPublic:!layer.isPublic });
      setLayers(prev => prev.map(l => l.id===layer.id ? {...l, isPublic:!l.isPublic} : l));
      toast?.success(layer.isPublic ? "Layer is now private." : "Layer published.");
    } catch (e) {
      toast?.error(e.message || "Could not update layer visibility.");
    }
  };

  const deleteLayer = async (layer) => {
    const ok = await confirm({
      title: "Delete Layer",
      message: `Delete layer "${layer.name}"? Annotations will be kept but unlinked.`,
      confirmText: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(layer.id);
      setLayers(prev => prev.filter(l => l.id!==layer.id));
      toast?.success("Layer deleted.");
    } catch (e) {
      toast?.error(e.message || "Could not delete layer.");
    }
  };

  const myLayers = allLayers.filter(l => l.isOwner);
  const subscribed = allLayers.filter(l => l.isSubscribed && !l.isOwner);
  const browsable = allLayers.filter(l => l.isPublic && !l.isOwner);

  const displayed = tab==="mine" ? myLayers : tab==="subscribed" ? subscribed : browsable;

  return (
    <div className="animate-in" style={{ maxWidth:740, margin:"0 auto", padding:"48px 24px 80px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:28, letterSpacing:2, marginBottom:4 }}>Annotation Layers</h1>
          <p style={{ fontFamily:"var(--font-fell)", fontStyle:"italic", color:"var(--text-muted)", fontSize:15 }}>
            Curated collections of annotations by readers and scholars.
          </p>
        </div>
        {user && <button className={`btn ${creating?"btn-secondary":"btn-primary"}`} onClick={()=>setCreating(!creating)}>{creating?"Cancel":"+ New Layer"}</button>}
      </div>

      {creating && (
        <div style={{ padding:20, background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)", marginBottom:20 }}>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Layer name (e.g. 'Rhetoric Deep Dive')" maxLength={80} style={{ fontSize:16, marginBottom:8 }} />
          <textarea className="input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Brief description…" maxLength={300} rows={2} style={{ marginBottom:8, resize:"vertical" }} />
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn btn-primary" onClick={create}>Create Layer</button>
            <span style={{ fontSize:13, color:"var(--text-light)", lineHeight:"34px" }}>Layers start private. Publish when ready.</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid var(--border-light)", paddingBottom:8 }}>
        {[{k:"browse",l:"Browse Public"},{k:"mine",l:`My Layers (${myLayers.length})`},{k:"subscribed",l:`Subscribed (${subscribed.length})`}].map(t => (
          <button key={t.k} className="btn btn-ghost" onClick={()=>setTab(t.k)} style={{
            fontSize:13, fontFamily:"var(--font-display)", letterSpacing:1,
            color: tab===t.k ? "var(--accent)" : "var(--text-light)",
            borderBottom: tab===t.k ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius:0, padding:"6px 12px",
          }}>{t.l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:"center" }}><div className="spinner"/></div>
      ) : displayed.length === 0 ? (
        <div style={{ padding:40, textAlign:"center", color:"var(--text-muted)", fontFamily:"var(--font-fell)", fontStyle:"italic" }}>
          {tab==="browse" ? "No public layers yet. Be the first to share your annotations!" :
           tab==="mine" ? "You haven't created any layers. Create one to organize and share your annotations." :
           "You haven't subscribed to any layers yet."}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {displayed.map(l => (
            <div key={l.id} style={{ padding:"16px 18px", background:"var(--surface)", borderRadius:8, border:"1px solid var(--border-light)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <Link to={`/layers/${l.id}`} style={{ fontFamily:"var(--font-display)", fontSize:18, color:"var(--accent)", textDecoration:"none", letterSpacing:0.5 }}
                    onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                    {l.name}
                  </Link>
                  {!l.isPublic && <span style={{ marginLeft:8, fontSize:11, padding:"2px 6px", background:"var(--gold-faint)", color:"var(--gold)", borderRadius:4, fontFamily:"var(--font-display)" }}>PRIVATE</span>}
                  {l.description && <div style={{ fontSize:14, color:"var(--text-muted)", marginTop:3, fontFamily:"var(--font-fell)", fontStyle:"italic" }}>{l.description}</div>}
                  <div style={{ fontSize:12, color:"var(--text-light)", marginTop:6, display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span>by <Link to={`/profile/${l.username}`} style={{color:"var(--text-light)"}}>{l.displayName}</Link></span>
                    <span>{l.annotationCount} annotation{l.annotationCount!==1?"s":""}</span>
                    <span>{l.subscriberCount} subscriber{l.subscriberCount!==1?"s":""}</span>
                    <span>{fmt(l.createdAt)}</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  {l.isOwner ? (
                    <>
                      <button className="btn btn-sm btn-secondary" onClick={()=>publish(l)} style={{ fontSize:12 }}>
                        {l.isPublic ? "Make Private" : "Publish"}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={()=>deleteLayer(l)} style={{ fontSize:12, color:"var(--danger)" }}>Delete</button>
                    </>
                  ) : user && (
                    <button className={`btn btn-sm ${l.isSubscribed?"btn-secondary":"btn-primary"}`} onClick={()=>toggle(l)} style={{ fontSize:12 }}>
                      {l.isSubscribed ? "Unsubscribe" : "Subscribe"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
