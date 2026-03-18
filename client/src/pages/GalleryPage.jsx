import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { gallery as galleryApi, works as worksApi } from "../lib/api";
import { useConfirm } from "../lib/ConfirmContext";
import { useToast } from "../lib/ToastContext";

function normalizeTagInput(tag) {
  const raw = String(tag || "").trim().replace(/^[\["']+|[\]"']+$/g, "");
  if (!raw) return "";
  if (raw.startsWith("slug:") || raw.startsWith("work:") || raw.startsWith("source:")) return "";
  if (raw.startsWith("category:")) return raw.slice("category:".length).trim();
  return raw;
}

function parseTagsText(raw) {
  return [...new Set(
    String(raw || "")
      .split(/[,\n;]+/)
      .map((tag) => normalizeTagInput(tag))
      .filter(Boolean),
  )];
}

function isVisibleTag(tag) {
  return !!tag
    && !tag.startsWith("slug:")
    && !tag.startsWith("work:")
    && !tag.startsWith("source:");
}

function displayTagLabel(tag) {
  if (String(tag || "").startsWith("category:")) {
    return String(tag).slice("category:".length).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return String(tag || "");
}

function objectPositionStyle(x = 50, y = 50) {
  const clampedX = Number.isFinite(Number(x)) ? Math.max(0, Math.min(100, Number(x))) : 50;
  const clampedY = Number.isFinite(Number(y)) ? Math.max(0, Math.min(100, Number(y))) : 50;
  return `${clampedX}% ${clampedY}%`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function toggleSlug(list, slug) {
  const next = Array.isArray(list) ? [...list] : [];
  if (next.includes(slug)) return next.filter((item) => item !== slug);
  return [...next, slug];
}

function WorkChipPicker({ works, value, onChange, placeholder = "Add work association" }) {
  const selected = Array.isArray(value) ? value : [];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        className="input"
        value=""
        onChange={(event) => {
          const slug = event.target.value;
          if (slug) onChange(toggleSlug(selected, slug));
          event.target.value = "";
        }}
      >
        <option value="">{placeholder}</option>
        {works.map((work) => (
          <option key={work.slug} value={work.slug}>{work.title}</option>
        ))}
      </select>
      {selected.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {selected.map((slug) => {
            const work = works.find((entry) => entry.slug === slug);
            return (
              <button
                key={slug}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onChange(toggleSlug(selected, slug))}
              >
                {work?.title || slug} ×
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function emptyEditor() {
  return {
    id: 0,
    title: "",
    sourceLabel: "Wikimedia Commons",
    pageUrl: "",
    imageUrl: "",
    localMediaPath: "",
    localMediaUrl: "",
    remoteImportUrl: "",
    tagsText: "",
    workSlugs: [],
    primaryWorkSlug: "",
    thumbX: 50,
    thumbY: 50,
  };
}

function editorFromItem(item) {
  return {
    id: item?.id || 0,
    title: item?.title || "",
    sourceLabel: item?.sourceLabel || "Wikimedia Commons",
    pageUrl: item?.pageUrl || "",
    imageUrl: item?.originalImageUrl || "",
    localMediaPath: item?.localMediaPath || "",
    localMediaUrl: item?.localMediaUrl || "",
    remoteImportUrl: "",
    tagsText: (item?.tags || []).filter((tag) => isVisibleTag(tag)).map((tag) => displayTagLabel(tag)).join(", "),
    workSlugs: [...new Set(item?.workSlugs || [])],
    primaryWorkSlug: item?.primaryWorkSlug || item?.workSlugs?.[0] || "",
    thumbX: Number.isFinite(Number(item?.thumbX)) ? Number(item.thumbX) : 50,
    thumbY: Number.isFinite(Number(item?.thumbY)) ? Number(item.thumbY) : 50,
  };
}

export default function GalleryPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [loading, setLoading] = useState(true);
  const [works, setWorks] = useState([]);
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [catalogWorks, setCatalogWorks] = useState([]);
  const [selectedWork, setSelectedWork] = useState(() => searchParams.get("work") || "");
  const [selectedTag, setSelectedTag] = useState(() => searchParams.get("tag") || "");
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [showEditor, setShowEditor] = useState(false);
  const [editor, setEditor] = useState(() => emptyEditor());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    worksApi.list()
      .then((data) => setCatalogWorks((data || []).filter((work) => work.has_content).sort((a, b) => a.title.localeCompare(b.title))))
      .catch(() => setCatalogWorks([]));
  }, []);

  useEffect(() => {
    setSelectedWork(searchParams.get("work") || "");
    setSelectedTag(searchParams.get("tag") || "");
    setQuery(searchParams.get("q") || "");
  }, [searchParamsKey, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (selectedWork) nextParams.set("work", selectedWork);
    if (selectedTag) nextParams.set("tag", selectedTag);
    if (query) nextParams.set("q", query);
    const next = nextParams.toString();
    if (next !== searchParamsKey) setSearchParams(nextParams, { replace: true });
  }, [query, searchParamsKey, selectedTag, selectedWork, setSearchParams]);

  const loadGallery = () => {
    setLoading(true);
    return galleryApi.list({ workSlug: selectedWork, tag: selectedTag, q: query, limit: 240 })
      .then((data) => {
        setWorks(data?.works || []);
        setItems(data?.items || []);
        setTags(data?.tags || []);
      })
      .catch((error) => {
        toast?.error(error?.message || "Could not load gallery.");
        setWorks([]);
        setItems([]);
        setTags([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedTag, selectedWork]);

  useEffect(() => {
    if (!showEditor || !editorRef.current) return;
    const id = requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
  }, [showEditor, editor.id]);

  const visibleTags = useMemo(
    () => tags.slice(0, 18),
    [tags],
  );

  const displayedWorks = useMemo(
    () => works.length ? works : catalogWorks.map((work) => ({ workSlug: work.slug, workTitle: work.title })),
    [catalogWorks, works],
  );

  const openNewEditor = () => {
    setEditor(emptyEditor());
    setShowEditor(true);
  };

  const openEditEditor = (item) => {
    setEditor(editorFromItem(item));
    setShowEditor(true);
  };

  const saveEditor = async () => {
    const payload = {
      title: editor.title,
      sourceLabel: editor.sourceLabel,
      pageUrl: editor.pageUrl,
      imageUrl: editor.imageUrl,
      localMediaPath: editor.localMediaPath,
      localMediaUrl: editor.localMediaUrl,
      tags: parseTagsText(editor.tagsText),
      workSlugs: editor.workSlugs,
      primaryWorkSlug: editor.primaryWorkSlug || editor.workSlugs[0] || "",
      thumbX: editor.thumbX,
      thumbY: editor.thumbY,
    };
    if (!payload.primaryWorkSlug) {
      toast?.error("Select at least one associated work.");
      return;
    }
    setSaving(true);
    try {
      if (editor.id) await galleryApi.updateImage(editor.id, payload);
      else await galleryApi.createImage(payload);
      toast?.success(editor.id ? "Gallery image updated." : "Gallery image added.");
      setShowEditor(false);
      setEditor(emptyEditor());
      await loadGallery();
    } catch (error) {
      toast?.error(error?.message || "Could not save gallery image.");
    } finally {
      setSaving(false);
    }
  };

  const deleteImage = async () => {
    if (!editor.id) return;
    const ok = await confirm({
      title: "Remove Gallery Image",
      message: "Remove this gallery image? Seeded items will be hidden from the site rather than permanently deleted.",
      confirmText: "Remove",
      cancelText: "Keep",
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await galleryApi.deleteImage(editor.id);
      toast?.success("Gallery image removed.");
      setShowEditor(false);
      setEditor(emptyEditor());
      await loadGallery();
    } catch (error) {
      toast?.error(error?.message || "Could not remove gallery image.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLocalFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await galleryApi.uploadImage(file.name, file.type, dataUrl);
      setEditor((prev) => ({
        ...prev,
        localMediaPath: uploaded.localMediaPath || "",
        localMediaUrl: uploaded.localMediaUrl || "",
      }));
      toast?.success("Image uploaded to gallery library.");
    } catch (error) {
      toast?.error(error?.message || "Could not upload image.");
    } finally {
      setUploading(false);
    }
  };

  const importRemoteImage = async () => {
    if (!editor.remoteImportUrl.trim()) return;
    setUploading(true);
    try {
      const uploaded = await galleryApi.importRemote(editor.remoteImportUrl, editor.title || "gallery");
      setEditor((prev) => ({
        ...prev,
        localMediaPath: uploaded.localMediaPath || "",
        localMediaUrl: uploaded.localMediaUrl || "",
        remoteImportUrl: "",
      }));
      toast?.success("Remote image mirrored into the gallery library.");
    } catch (error) {
      toast?.error(error?.message || "Could not import remote image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="animate-in" style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 24px 40px" }}>
      <div style={{ maxWidth: 760, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          Commons Gallery
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1.2 }}>
          Shakespeare Art Gallery
        </h1>
        <p style={{ margin: "12px 0 0", color: "var(--text-muted)", lineHeight: 1.7, fontSize: 15 }}>
          Open-source Shakespeare artwork organized for reuse across Codex Lector. Works are associated canonically by work slug, so the same image library can support quote cards, places, and future character galleries.
        </p>
      </div>

      {user?.isAdmin && (
        <div style={{ marginBottom: 22, padding: 16, border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)" }}>
          <div ref={editorRef} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: showEditor ? 14 : 0 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                Gallery Admin
              </div>
              <div style={{ fontSize: 13, color: "var(--text-light)", marginTop: 4 }}>
                Add images manually, retag them, mirror new source URLs locally, and associate them with one or more works.
              </div>
            </div>
            {!showEditor ? (
              <button className="btn btn-primary" onClick={openNewEditor}>Add Gallery Image</button>
            ) : (
              <button className="btn btn-secondary" onClick={() => { setShowEditor(false); setEditor(emptyEditor()); }}>Close Editor</button>
            )}
          </div>

          {showEditor && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <input className="input" value={editor.title} onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))} placeholder="Image title" />
                <input className="input" value={editor.sourceLabel} onChange={(event) => setEditor((prev) => ({ ...prev, sourceLabel: event.target.value }))} placeholder="Source label" />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                  Featured work. This is the main work the image files under and the default work link on the card.
                </div>
                <select
                  className="input"
                  value={editor.primaryWorkSlug}
                  onChange={(event) => {
                    const slug = event.target.value;
                    setEditor((prev) => ({
                      ...prev,
                      primaryWorkSlug: slug,
                      workSlugs: slug ? [...new Set([slug, ...(prev.workSlugs || [])])] : prev.workSlugs,
                    }));
                  }}
                >
                  <option value="">Featured work</option>
                  {catalogWorks.map((work) => (
                    <option key={work.slug} value={work.slug}>{work.title}</option>
                  ))}
                </select>
              </div>

              <WorkChipPicker
                works={catalogWorks}
                value={editor.workSlugs}
                onChange={(next) => setEditor((prev) => ({
                  ...prev,
                  workSlugs: next,
                  primaryWorkSlug: next.includes(prev.primaryWorkSlug) ? prev.primaryWorkSlug : (next[0] || ""),
                }))}
                placeholder="Add associated work"
              />

              <div style={{ fontSize: 12, color: "var(--text-light)", marginTop: -2 }}>
                Associated works are the other plays or poems this image should appear under. These use the same canonical work slug system as places.
              </div>

              <input className="input" value={editor.pageUrl} onChange={(event) => setEditor((prev) => ({ ...prev, pageUrl: event.target.value }))} placeholder="Source page URL" />
              <input className="input" value={editor.imageUrl} onChange={(event) => setEditor((prev) => ({ ...prev, imageUrl: event.target.value }))} placeholder="Remote image URL (optional if mirrored locally)" />
              <textarea className="input" rows={2} value={editor.tagsText} onChange={(event) => setEditor((prev) => ({ ...prev, tagsText: event.target.value }))} placeholder="Tags (comma separated plain English, e.g. Roman history, Brutus, stage costume)" style={{ resize: "vertical" }} />

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-light)" }}>Upload local file</span>
                  <input type="file" accept="image/*" onChange={(event) => uploadLocalFile(event.target.files?.[0])} disabled={uploading} />
                </label>
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-light)" }}>Mirror remote URL to local media</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input className="input" value={editor.remoteImportUrl} onChange={(event) => setEditor((prev) => ({ ...prev, remoteImportUrl: event.target.value }))} placeholder="https://…" />
                    <button className="btn btn-secondary btn-sm" onClick={importRemoteImage} disabled={uploading || !editor.remoteImportUrl.trim()}>
                      Mirror
                    </button>
                  </div>
                </div>
              </div>

              {(editor.localMediaUrl || editor.imageUrl) && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                      Display source: {editor.localMediaUrl ? "Local media copy" : "Remote image URL"}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEditor((prev) => ({ ...prev, thumbX: 50, thumbY: 50 }))}
                    >
                      Reset thumbnail crop
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-light)" }}>Thumbnail horizontal focus: {Math.round(editor.thumbX)}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editor.thumbX}
                        onChange={(event) => setEditor((prev) => ({ ...prev, thumbX: Number(event.target.value) }))}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-light)" }}>Thumbnail vertical focus: {Math.round(editor.thumbY)}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={editor.thumbY}
                        onChange={(event) => setEditor((prev) => ({ ...prev, thumbY: Number(event.target.value) }))}
                      />
                    </label>
                  </div>
                  <img
                    src={editor.localMediaUrl || editor.imageUrl}
                    alt={editor.title || "Gallery preview"}
                    style={{
                      width: "min(360px, 100%)",
                      aspectRatio: "4 / 3",
                      objectFit: "cover",
                      objectPosition: objectPositionStyle(editor.thumbX, editor.thumbY),
                      borderRadius: 12,
                      border: "1px solid var(--border-light)",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={saveEditor} disabled={saving || uploading}>
                  {saving ? "Saving..." : editor.id ? "Save Image" : "Add Image"}
                </button>
                {editor.id ? (
                  <button className="btn btn-secondary btn-sm" onClick={deleteImage} disabled={saving}>
                    Remove Image
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 2fr) auto", gap: 10, marginBottom: 16 }}>
        <select className="input" value={selectedWork} onChange={(event) => setSelectedWork(event.target.value)}>
          <option value="">All works</option>
          {displayedWorks.map((work) => (
            <option key={work.workSlug || work.workTitle} value={work.workSlug}>
              {work.workTitle}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search image title, work, or tag…"
        />
        <button
          className="btn btn-secondary"
          onClick={() => {
            setSelectedWork("");
            setSelectedTag("");
            setQuery("");
          }}
        >
          Reset
        </button>
      </div>

      {visibleTags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <button className={selectedTag ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"} onClick={() => setSelectedTag("")}>
            All tags
          </button>
          {visibleTags.map((tag) => (
            <button
              key={tag.tag}
              className={selectedTag === tag.tag ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => setSelectedTag(tag.tag)}
            >
              {tag.label || displayTagLabel(tag.tag)} ({tag.count})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 50, textAlign: "center" }}><div className="spinner" /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: 28, border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)", color: "var(--text-muted)", lineHeight: 1.7 }}>
          No gallery images match the current filters yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {items.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid var(--border-light)",
                borderRadius: 16,
                overflow: "hidden",
                background: "var(--surface)",
                boxShadow: "0 16px 34px rgba(0,0,0,0.05)",
              }}
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "4 / 3",
                  objectFit: "cover",
                  objectPosition: objectPositionStyle(item.thumbX, item.thumbY),
                  display: "block",
                }}
              />
              <div style={{ padding: 14, display: "grid", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--accent)", lineHeight: 1.35, marginBottom: 6 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: 1.1 }}>
                    {(item.works || []).slice(0, 2).map((work) => work.title).join(" · ")}
                    {(item.works || []).length > 2 ? ` +${item.works.length - 2}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.primaryWorkSlug && (
                    <Link className="btn btn-ghost btn-sm" to={`/read/${item.primaryWorkSlug}`}>
                      Open Work
                    </Link>
                  )}
                  {item.pageUrl && (
                    <a className="btn btn-secondary btn-sm" href={item.pageUrl} target="_blank" rel="noopener noreferrer">
                      Source
                    </a>
                  )}
                  {user?.isAdmin && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditEditor(item)}>
                      Edit
                    </button>
                  )}
                </div>

                {item.tags?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {item.tags
                      .filter((tag) => isVisibleTag(tag))
                      .slice(0, 4)
                      .map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: "inline-flex",
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: "var(--bg)",
                            border: "1px solid var(--border-light)",
                            fontSize: 11,
                            color: "var(--text-light)",
                          }}
                        >
                          {displayTagLabel(tag)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
