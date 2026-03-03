import { useState } from "react";
import { reports as reportsApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const REASONS = [
  "Spam",
  "Abusive",
  "Off-topic",
  "Misinformation",
  "Other",
];

export default function ReportButton({ targetType, targetId, label = "Report" }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await reportsApi.create(targetType, targetId, reason, details.trim());
      toast?.success("Report submitted.");
      setDetails("");
      setReason(REASONS[0]);
      setOpen(false);
    } catch (e) {
      toast?.error(e.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        style={{ color:"var(--text-light)", fontSize:11 }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ marginTop:6, padding:10, background:"var(--bg)", border:"1px solid var(--border-light)", borderRadius:6 }}>
      <div style={{ fontSize:11, fontFamily:"var(--font-display)", letterSpacing:1, color:"var(--text-light)", marginBottom:6 }}>
        REPORT CONTENT
      </div>
      <select className="input" value={reason} onChange={e=>setReason(e.target.value)} style={{ fontSize:12, marginBottom:6, padding:"4px 8px" }}>
        {REASONS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      <textarea
        className="input"
        value={details}
        onChange={e=>setDetails(e.target.value)}
        placeholder="Optional details for moderation…"
        style={{ minHeight:56, resize:"vertical", fontSize:12, marginBottom:6 }}
      />
      <div style={{ display:"flex", gap:6 }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>
          Send
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
