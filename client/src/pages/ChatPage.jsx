import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import ReportButton from "../components/ReportButton";
import { useAuth } from "../lib/AuthContext";
import { useConfirm } from "../lib/ConfirmContext";
import { chat as chatApi, works as worksApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";

const FALLBACK_SPECIAL_ROOMS = [
  {
    key: "lobby",
    label: "Lobby",
    kind: "global",
    description: "General conversation across Codex Lector.",
    workSlug: "",
    messageCount: 0,
    lastMessageAt: null,
  },
  {
    key: "year-2026-2027",
    label: "Year of Shakespeare",
    kind: "program",
    description: "Shared reading room for March 11, 2026 through March 10, 2027.",
    workSlug: "",
    messageCount: 0,
    lastMessageAt: null,
  },
];

function fmtMessageTime(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function mergeMessages(existing, incoming) {
  const map = new Map();
  (existing || []).forEach((message) => map.set(message.id, message));
  (incoming || []).forEach((message) => map.set(message.id, message));
  return [...map.values()].sort((a, b) => a.id - b.id);
}

function setRoomSearchParams(setSearchParams, roomKey = "lobby", workSlug = "") {
  const params = new URLSearchParams();
  if (workSlug) params.set("work", workSlug);
  else if (roomKey && roomKey !== "lobby") params.set("room", roomKey);
  setSearchParams(params);
}

function updateSpecialRoomList(list, room) {
  return (list || []).map((item) => (
    item.key === room.key
      ? { ...item, messageCount: room.messageCount, lastMessageAt: room.lastMessageAt }
      : item
  ));
}

function upsertActiveWorkRoom(list, room) {
  if ((room.messageCount || 0) <= 0) {
    return (list || []).filter((item) => item.workSlug !== room.workSlug);
  }
  const next = [room, ...(list || []).filter((item) => item.workSlug !== room.workSlug)];
  return next
    .sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")))
    .slice(0, 24);
}

function Avatar({ message }) {
  if (message.oauthAvatar) {
    return (
      <img
        src={message.oauthAvatar}
        alt=""
        style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-light)" }}
      />
    );
  }
  return (
    <div style={{
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: message.avatarColor || "var(--accent)",
      color: "var(--accent-contrast)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-display)",
      fontSize: 14,
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {(message.displayName || message.username || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function MessageCard({ message, currentUser, deletingId, onDelete }) {
  const canDelete = !!currentUser && (currentUser.id === message.userId || currentUser.isAdmin);

  return (
    <div
      id={`chat-message-${message.id}`}
      style={{
        border: "1px solid var(--border-light)",
        borderRadius: 14,
        padding: "12px 14px",
        background: "var(--surface)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar message={message} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: message.isAdmin ? "var(--gold)" : "var(--accent)" }}>{message.displayName}</strong>
              {message.isAdmin && <span className="admin-badge">Author</span>}
              <span style={{ fontSize: 12, color: "var(--text-light)" }}>{fmtMessageTime(message.createdAt)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {currentUser && currentUser.id !== message.userId && (
                <ReportButton targetType="chat_message" targetId={message.id} label="Report" />
              )}
              {canDelete && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onDelete(message)}
                  disabled={String(deletingId) === String(message.id)}
                  style={{ color: "var(--danger)" }}
                >
                  {String(deletingId) === String(message.id) ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "var(--text)" }}>
            {message.body}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const toast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [works, setWorks] = useState([]);
  const [specialRooms, setSpecialRooms] = useState(FALLBACK_SPECIAL_ROOMS);
  const [activeWorkRooms, setActiveWorkRooms] = useState([]);
  const [roomInfo, setRoomInfo] = useState(FALLBACK_SPECIAL_ROOMS[0]);
  const [messages, setMessages] = useState([]);
  const [workSearch, setWorkSearch] = useState("");
  const [compose, setCompose] = useState("");
  const [loadingSidebar, setLoadingSidebar] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [streamState, setStreamState] = useState("connecting");
  const [error, setError] = useState("");
  const messagePaneRef = useRef(null);
  const activeRoomRef = useRef({ roomKey: "lobby", workSlug: "" });

  const selectedWorkSlug = searchParams.get("work") || "";
  const selectedRoomParam = searchParams.get("room") || "";
  const activeRoomKey = selectedWorkSlug ? `work:${selectedWorkSlug}` : (selectedRoomParam || "lobby");
  const draftKey = `draft:chat:${activeRoomKey}`;

  const filteredWorks = useMemo(() => {
    const q = workSearch.trim().toLowerCase();
    const list = (works || []).filter((work) => work.has_content);
    if (!q) return list.slice(0, 16);
    return list.filter((work) => {
      const haystack = `${work.title} ${work.slug}`.toLowerCase();
      return haystack.includes(q);
    }).slice(0, 16);
  }, [works, workSearch]);

  const currentWork = useMemo(
    () => works.find((work) => work.slug === selectedWorkSlug) || null,
    [works, selectedWorkSlug],
  );

  const scrollToBottom = useCallback((force = false) => {
    const pane = messagePaneRef.current;
    if (!pane) return;
    const nearBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120;
    if (force || nearBottom) {
      pane.scrollTop = pane.scrollHeight;
    }
  }, []);

  const loadSidebar = useCallback(async () => {
    setLoadingSidebar(true);
    try {
      const [worksData, roomData] = await Promise.all([
        worksApi.list(),
        chatApi.rooms(),
      ]);
      setWorks((worksData || []).filter((work) => work.has_content));
      setSpecialRooms(roomData.specialRooms?.length ? roomData.specialRooms : FALLBACK_SPECIAL_ROOMS);
      setActiveWorkRooms(roomData.activeWorkRooms || []);
    } catch (e) {
      toast?.error(e.message || "Could not load chat rooms.");
      setSpecialRooms(FALLBACK_SPECIAL_ROOMS);
      setActiveWorkRooms([]);
    } finally {
      setLoadingSidebar(false);
    }
  }, [toast]);

  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    setError("");
    try {
      const data = await chatApi.messages(selectedWorkSlug ? "" : activeRoomKey, selectedWorkSlug, 90);
      setRoomInfo(data.room || FALLBACK_SPECIAL_ROOMS[0]);
      setMessages(data.messages || []);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e) {
      setError(e.message || "Could not load this chat room.");
      setMessages([]);
      if (selectedWorkSlug || activeRoomKey !== "lobby") {
        setRoomSearchParams(setSearchParams, "lobby", "");
      }
    } finally {
      setLoadingMessages(false);
    }
  }, [activeRoomKey, scrollToBottom, selectedWorkSlug, setSearchParams]);

  useEffect(() => {
    loadSidebar();
  }, [loadSidebar]);

  useEffect(() => {
    activeRoomRef.current = { roomKey: activeRoomKey, workSlug: selectedWorkSlug };
  }, [activeRoomKey, selectedWorkSlug]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const nextDraft = localStorage.getItem(draftKey) || "";
    setCompose(nextDraft);
  }, [draftKey]);

  useEffect(() => {
    if (selectedWorkSlug && works.length && !works.some((work) => work.slug === selectedWorkSlug)) {
      setRoomSearchParams(setSearchParams, "lobby", "");
    }
  }, [selectedWorkSlug, setSearchParams, works]);

  useEffect(() => {
    const source = new EventSource("/api/chat/stream");

    const handleReady = () => setStreamState("live");
    const handlePing = () => setStreamState("live");
    const handleMessage = (event) => {
      setStreamState("live");
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload?.message || !payload?.room) return;
        if (payload.room.kind === "work" && payload.room.workSlug) {
          setActiveWorkRooms((prev) => upsertActiveWorkRoom(prev, payload.room));
        } else {
          setSpecialRooms((prev) => updateSpecialRoomList(prev, payload.room));
        }
        if (payload.message.roomKey !== activeRoomRef.current.roomKey) return;
        setRoomInfo(payload.room);
        setMessages((prev) => mergeMessages(prev, [payload.message]));
        requestAnimationFrame(() => scrollToBottom(false));
      } catch {}
    };
    const handleDelete = (event) => {
      setStreamState("live");
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload.room?.kind === "work" && payload.room.workSlug) {
          setActiveWorkRooms((prev) => upsertActiveWorkRoom(prev, payload.room));
        } else if (payload.room) {
          setSpecialRooms((prev) => updateSpecialRoomList(prev, payload.room));
        }
        if (!payload || payload.roomKey !== activeRoomRef.current.roomKey) return;
        if (payload.room) setRoomInfo(payload.room);
        setMessages((prev) => prev.filter((message) => message.id !== payload.id));
      } catch {}
    };

    source.addEventListener("ready", handleReady);
    source.addEventListener("ping", handlePing);
    source.addEventListener("message", handleMessage);
    source.addEventListener("delete", handleDelete);
    source.onerror = () => setStreamState("reconnecting");

    return () => {
      source.close();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [location.hash, messages.length]);

  const setComposeDraft = (value) => {
    setCompose(value);
    localStorage.setItem(draftKey, value);
  };

  const submitMessage = async () => {
    const body = compose.trim();
    if (!user || sending || !body) return;
    setSending(true);
    try {
      const data = await chatApi.post(body, selectedWorkSlug ? "" : activeRoomKey, selectedWorkSlug);
      setRoomInfo(data.room || roomInfo);
      setMessages((prev) => mergeMessages(prev, [data.message]));
      if (data.room?.kind === "work" && data.room.workSlug) {
        setActiveWorkRooms((prev) => upsertActiveWorkRoom(prev, data.room));
      } else if (data.room) {
        setSpecialRooms((prev) => updateSpecialRoomList(prev, data.room));
      }
      setCompose("");
      localStorage.removeItem(draftKey);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (e) {
      toast?.error(e.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (message) => {
    const ok = await confirm({
      title: "Delete Chat Message",
      message: "Delete this message? This cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
    });
    if (!ok) return;

    setDeletingId(String(message.id));
    try {
      await chatApi.delete(message.id);
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
      toast?.success("Message deleted.");
    } catch (e) {
      toast?.error(e.message || "Could not delete message.");
    } finally {
      setDeletingId("");
    }
  };

  const roomStatusLabel = streamState === "live" ? "Live" : streamState === "reconnecting" ? "Reconnecting" : "Connecting";

  return (
    <div className="animate-in" style={{ maxWidth: 1240, margin: "0 auto", padding: "38px 24px 72px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>
          Conversation
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1.5 }}>
          Live Chat
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: "var(--text-muted)", lineHeight: 1.75, maxWidth: 860 }}>
          Join the lobby, the shared Year of Shakespeare room, or a live room for any individual work.
        </p>
      </div>

      <div className="chat-layout">
        <aside style={{ display: "grid", gap: 16, alignSelf: "start" }}>
          <div style={{ border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)", padding: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
              Rooms
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(specialRooms || FALLBACK_SPECIAL_ROOMS).map((room) => {
                const active = !selectedWorkSlug && activeRoomKey === room.key;
                return (
                  <button
                    key={room.key}
                    className={active ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => setRoomSearchParams(setSearchParams, room.key, "")}
                    style={{ width: "100%", textAlign: "left", padding: "10px 12px" }}
                  >
                    <span style={{ display: "block", fontFamily: "var(--font-display)", color: active ? "inherit" : "var(--text)" }}>{room.label}</span>
                    <span style={{ display: "block", fontSize: 12, color: active ? "inherit" : "var(--text-light)", marginTop: 3 }}>
                      {room.messageCount || 0} messages
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)", padding: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
              Open Work Room
            </div>
            <input
              className="input"
              value={workSearch}
              onChange={(event) => setWorkSearch(event.target.value)}
              placeholder="Find a play or poem..."
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {filteredWorks.map((work) => {
                const active = selectedWorkSlug === work.slug;
                return (
                  <button
                    key={work.slug}
                    className={active ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                    onClick={() => setRoomSearchParams(setSearchParams, "", work.slug)}
                    style={{ justifyContent: "flex-start", textAlign: "left", padding: "7px 10px" }}
                  >
                    {work.title}
                  </button>
                );
              })}
              {!filteredWorks.length && (
                <div style={{ color: "var(--text-light)", fontSize: 13 }}>
                  No works match that search.
                </div>
              )}
            </div>
          </div>

          <div style={{ border: "1px solid var(--border-light)", borderRadius: 16, background: "var(--surface)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)" }}>
                Active Work Rooms
              </div>
              <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                {loadingSidebar ? "Loading..." : `${activeWorkRooms.length} shown`}
              </div>
            </div>
            {loadingSidebar ? (
              <div style={{ padding: 12, textAlign: "center" }}><div className="spinner" /></div>
            ) : activeWorkRooms.length === 0 ? (
              <div style={{ color: "var(--text-light)", fontSize: 13 }}>
                No work rooms have messages yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {activeWorkRooms.map((room) => {
                  const active = selectedWorkSlug === room.workSlug;
                  return (
                    <button
                      key={room.key}
                      className={active ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                      onClick={() => setRoomSearchParams(setSearchParams, "", room.workSlug)}
                      style={{ width: "100%", textAlign: "left", padding: "8px 10px" }}
                    >
                      <span style={{ display: "block", fontFamily: "var(--font-display)", color: active ? "inherit" : "var(--text)" }}>{room.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: active ? "inherit" : "var(--text-light)", marginTop: 2 }}>
                        {room.messageCount || 0} messages
                        {room.lastMessageAt ? ` • ${fmtMessageTime(room.lastMessageAt)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section style={{ minWidth: 0 }}>
          <div style={{ border: "1px solid var(--border-light)", borderRadius: 18, background: "linear-gradient(180deg, rgba(201,168,76,0.06), rgba(122,30,46,0.03))", padding: 18, boxShadow: "0 14px 30px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", marginBottom: 6 }}>
                  {roomInfo.label}
                </div>
                <div style={{ color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 720 }}>
                  {roomInfo.description}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color: streamState === "live" ? "var(--success)" : "var(--gold)",
                    border: "1px solid var(--border-light)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    background: "var(--surface)",
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: streamState === "live" ? "var(--success)" : "var(--gold)" }} />
                    {roomStatusLabel}
                  </span>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 12,
                    color: "var(--text-light)",
                    border: "1px solid var(--border-light)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    background: "var(--surface)",
                  }}>
                    {roomInfo.messageCount || messages.length} messages
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {roomInfo.workSlug && (
                  <Link className="btn btn-secondary btn-sm" to={`/read/${roomInfo.workSlug}`}>
                    Open Text
                  </Link>
                )}
                {roomInfo.key === "year-2026-2027" && (
                  <Link className="btn btn-secondary btn-sm" to="/year-of-shakespeare">
                    Open Calendar
                  </Link>
                )}
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, background: "rgba(139,31,31,0.08)", border: "1px solid rgba(139,31,31,0.22)", color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <div
              ref={messagePaneRef}
              style={{
                border: "1px solid var(--border-light)",
                borderRadius: 16,
                background: "var(--bg)",
                minHeight: 420,
                maxHeight: 620,
                overflowY: "auto",
                padding: 14,
                display: "grid",
                gap: 10,
                marginBottom: 14,
              }}
            >
              {loadingMessages ? (
                <div style={{ padding: 40, textAlign: "center" }}><div className="spinner" /></div>
              ) : messages.length === 0 ? (
                <div style={{ padding: 36, textAlign: "center", color: "var(--text-light)", lineHeight: 1.7 }}>
                  No messages yet. Start the room if you want to be first.
                </div>
              ) : (
                messages.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    currentUser={user}
                    deletingId={deletingId}
                    onDelete={deleteMessage}
                  />
                ))
              )}
            </div>

            {user ? (
              <div>
                <textarea
                  className="input"
                  value={compose}
                  onChange={(event) => setComposeDraft(event.target.value)}
                  placeholder={currentWork ? `Discuss ${currentWork.title} live...` : "Say something to the room..."}
                  style={{ minHeight: 96, resize: "vertical", marginBottom: 10, lineHeight: 1.7 }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-light)" }}>
                    Messages are public. Keep it civil and text-focused.
                  </div>
                  <button className="btn btn-primary" onClick={submitMessage} disabled={sending || !compose.trim()}>
                    {sending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--text-light)", fontStyle: "italic", lineHeight: 1.7 }}>
                Sign in to send messages. You can still read the room without posting.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
