import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import EvaLabel from "../components/EvaLabel";
import { works as worksApi } from "../lib/api";
import { useToast } from "../lib/ToastContext";
import { buildPeopleGraphFromXML, buildPeopleNetwork } from "../lib/peopleGraph";

function statCard(label, value, note = "") {
  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--surface)",
      border: "1px solid var(--border-light)",
      borderRadius: 10,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "var(--text-light)",
        fontFamily: "var(--font-display)",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        color: "var(--accent)",
        fontFamily: "var(--font-display)",
        lineHeight: 1,
        marginBottom: note ? 6 : 0,
      }}>
        {value}
      </div>
      {note && <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45 }}>{note}</div>}
    </div>
  );
}

function sortSceneRefs(refs) {
  const map = new Map();
  (refs || []).forEach((ref) => {
    if (!map.has(ref.sceneId)) map.set(ref.sceneId, ref);
  });
  return [...map.values()].sort((a, b) => (a.lineStart || 0) - (b.lineStart || 0));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const GRAPH_WIDTH = 860;
const GRAPH_HEIGHT = 620;
const GRAPH_PADDING = 72;
const GRAPH_CENTER = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };

function buildGraphLayout(nodes, edges, selectedNodeId) {
  const positions = {};
  if (!nodes.length) return positions;

  const orderedNodes = [...nodes].sort((a, b) => {
    if (b.connectionWeight !== a.connectionWeight) return b.connectionWeight - a.connectionWeight;
    if (b.lineCount !== a.lineCount) return b.lineCount - a.lineCount;
    return a.name.localeCompare(b.name);
  });

  function placeRing(ringNodes, radius, angleOffset = 0) {
    if (!ringNodes.length) return;
    ringNodes.forEach((node, index) => {
      const angle = angleOffset - Math.PI / 2 + (index / ringNodes.length) * Math.PI * 2;
      positions[node.id] = {
        x: GRAPH_CENTER.x + Math.cos(angle) * radius,
        y: GRAPH_CENTER.y + Math.sin(angle) * radius,
        angle,
      };
    });
  }

  if (selectedNodeId && orderedNodes.some((node) => node.id === selectedNodeId)) {
    positions[selectedNodeId] = { ...GRAPH_CENTER, angle: -Math.PI / 2 };
    const neighborIds = new Set();
    edges.forEach((edge) => {
      if (edge.sourceId === selectedNodeId) neighborIds.add(edge.targetId);
      if (edge.targetId === selectedNodeId) neighborIds.add(edge.sourceId);
    });
    const innerRing = orderedNodes.filter((node) => node.id !== selectedNodeId && neighborIds.has(node.id));
    const outerRing = orderedNodes.filter((node) => node.id !== selectedNodeId && !neighborIds.has(node.id));
    placeRing(innerRing, clamp(125 + innerRing.length * 3, 145, 185));
    placeRing(outerRing, clamp(200 + outerRing.length * 2, 220, 245), innerRing.length ? Math.PI / innerRing.length : 0);
    return positions;
  }

  if (orderedNodes.length === 1) {
    positions[orderedNodes[0].id] = { ...GRAPH_CENTER, angle: -Math.PI / 2 };
    return positions;
  }

  placeRing(orderedNodes, clamp(150 + orderedNodes.length * 3, 170, 225));
  return positions;
}

function GraphPanel({
  nodes,
  edges,
  edgeMode,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}) {
  const positions = useMemo(
    () => buildGraphLayout(nodes, edges, selectedNodeId),
    [nodes, edges, selectedNodeId],
  );

  const maxWeight = Math.max(1, ...edges.map((edge) => edge.weight || 0));
  const selectedEdge = selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) : null;
  const neighborIds = new Set();
  if (selectedNodeId) {
    edges.forEach((edge) => {
      if (edge.sourceId === selectedNodeId) neighborIds.add(edge.targetId);
      if (edge.targetId === selectedNodeId) neighborIds.add(edge.sourceId);
    });
  }

  return (
    <div style={{
      background: "radial-gradient(circle at top, var(--surface) 0%, var(--bg) 72%)",
      border: "1px solid var(--border-light)",
      borderRadius: 16,
      padding: 18,
      minHeight: 560,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)", letterSpacing: 1 }}>
            Character Network
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {edgeMode === "turn_exchange"
              ? "Edges count consecutive speech exchanges inside the current scope."
              : "Edges count shared scene presence inside the current scope."}
          </div>
        </div>
        {(selectedNodeId || selectedEdgeId) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onSelectNode("");
              onSelectEdge("");
            }}
            style={{ color: "var(--text-light)" }}
          >
            Clear Focus
          </button>
        )}
      </div>

      {!nodes.length ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: "var(--text-light)",
          fontStyle: "italic",
          padding: 24,
        }}>
          No people appear in this scope.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <svg
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            style={{ width: "100%", height: "100%", minHeight: 480, display: "block", overflow: "visible" }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                onSelectNode("");
                onSelectEdge("");
              }
            }}
          >
            <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r="126" fill="var(--gold-faint)" />
            <circle cx={GRAPH_CENTER.x} cy={GRAPH_CENTER.y} r="88" fill="var(--accent-faint)" />
            <text
              x={GRAPH_CENTER.x}
              y={GRAPH_CENTER.y - 12}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-display)", fontSize: 16, letterSpacing: 1.2, fill: "var(--accent)" }}
            >
              {edgeMode === "turn_exchange" ? "Turn Exchanges" : "Shared Scenes"}
            </text>
            <text
              x={GRAPH_CENTER.x}
              y={GRAPH_CENTER.y + 12}
              textAnchor="middle"
              style={{ fontFamily: "var(--font-body)", fontSize: 13, fill: "var(--text-light)" }}
            >
              {nodes.length} characters • {edges.length} connections
            </text>

            {edges.map((edge) => {
              const source = positions[edge.sourceId];
              const target = positions[edge.targetId];
              if (!source || !target) return null;
              const isSelected = selectedEdgeId === edge.id;
              const touchesSelectedNode = selectedNodeId && (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId);
              const touchesSelectedEdge = selectedEdge && (edge.id === selectedEdge.id);
              const muted = (selectedNodeId && !touchesSelectedNode) || (selectedEdge && !touchesSelectedEdge);
              const opacity = isSelected ? 0.95 : muted ? 0.035 : 0.22 + (edge.weight / maxWeight) * 0.5;
              const stroke = isSelected
                ? "var(--accent)"
                : edgeMode === "turn_exchange"
                  ? "var(--gold)"
                  : "var(--border)";
              const strokeWidth = isSelected ? 5 : 1.5 + (edge.weight / maxWeight) * 4;
              const midX = (source.x + target.x) / 2;
              const midY = (source.y + target.y) / 2;
              return (
                <g key={edge.id}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    opacity={opacity}
                  />
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="transparent"
                    strokeWidth={16}
                    strokeLinecap="round"
                    style={{ cursor: "pointer" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectNode("");
                      onSelectEdge(edge.id);
                    }}
                  />
                  {edge.weight > 1 && !muted && (
                    <>
                      <circle cx={midX} cy={midY} r="11" fill="var(--surface)" opacity={muted ? 0.28 : 0.92} />
                      <text
                        x={midX}
                        y={midY + 4}
                        textAnchor="middle"
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fill: isSelected ? "var(--accent)" : "var(--text-muted)",
                          pointerEvents: "none",
                        }}
                      >
                        {edge.weight}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const isSelected = selectedNodeId === node.id;
              const inSelectedEdge = selectedEdge && (selectedEdge.sourceId === node.id || selectedEdge.targetId === node.id);
              const isNeighbor = selectedNodeId ? neighborIds.has(node.id) : false;
              const muted = (selectedNodeId && !isSelected && !isNeighbor) || (selectedEdge && !inSelectedEdge);
              const focusVisible = isSelected || inSelectedEdge || isNeighbor;
              const radius = clamp(12 + Math.sqrt(Math.max(1, node.lineCount || 1)) * 0.85 + node.connectionWeight * 0.18, 12, 32);
              const labelFontSize = isSelected ? 14 : 12;
              const approxLabelWidth = clamp(node.name.length * labelFontSize * 0.58, 44, 190);
              let labelX = pos.x + Math.cos(pos.angle || 0) * (radius + 16);
              let labelY = pos.y + Math.sin(pos.angle || 0) * (radius + 16);
              const textAnchor = Math.cos(pos.angle || 0) > 0.35
                ? "start"
                : Math.cos(pos.angle || 0) < -0.35
                  ? "end"
                  : "middle";
              const leftBound = GRAPH_PADDING;
              const rightBound = GRAPH_WIDTH - GRAPH_PADDING;
              const topBound = GRAPH_PADDING;
              const bottomBound = GRAPH_HEIGHT - GRAPH_PADDING;
              if (textAnchor === "start") {
                labelX = Math.min(labelX, rightBound - approxLabelWidth);
              } else if (textAnchor === "end") {
                labelX = Math.max(labelX, leftBound + approxLabelWidth);
              } else {
                labelX = clamp(labelX, leftBound + approxLabelWidth / 2, rightBound - approxLabelWidth / 2);
              }
              labelY = clamp(labelY, topBound + labelFontSize, bottomBound - 4);
              const fill = isSelected ? "var(--accent)" : node.connectionWeight > 0 ? "var(--gold)" : "var(--surface)";
              const stroke = isSelected ? "var(--gold-light)" : "var(--accent)";
              const labelPaddingX = 9;
              const labelRectX = textAnchor === "start"
                ? labelX - labelPaddingX
                : textAnchor === "end"
                  ? labelX - approxLabelWidth - labelPaddingX
                  : labelX - (approxLabelWidth / 2) - labelPaddingX;
              const labelRectWidth = approxLabelWidth + labelPaddingX * 2;
              const showLabelBackdrop = focusVisible && !muted;
              const labelFill = isSelected
                ? "var(--accent)"
                : inSelectedEdge
                  ? "var(--text)"
                  : "var(--text-muted)";
              return (
                <g key={node.id}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius + (isSelected ? 4 : 0)}
                    fill={isSelected ? "var(--gold-faint)" : "transparent"}
                    opacity={muted ? 0.03 : 0.9}
                  />
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    opacity={muted ? 0.08 : 0.95}
                    style={{ cursor: "pointer" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEdge("");
                      onSelectNode(node.id);
                    }}
                  />
                  {!muted && showLabelBackdrop && (
                    <rect
                      x={labelRectX}
                      y={labelY - labelFontSize - 4}
                      width={labelRectWidth}
                      height={labelFontSize + 12}
                      rx={10}
                      fill="var(--surface)"
                      stroke={isSelected ? "var(--gold-light)" : "var(--border-light)"}
                      strokeWidth={isSelected ? 1.5 : 1}
                      opacity={isSelected ? 0.96 : 0.9}
                    />
                  )}
                  {!muted && (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={textAnchor}
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: labelFontSize,
                        fontWeight: isSelected ? 600 : 400,
                        fill: labelFill,
                        opacity: 1,
                        pointerEvents: "none",
                      }}
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function SceneLinkList({ refs, workSlug, title, emptyText }) {
  const items = sortSceneRefs(refs);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "var(--text-light)",
        fontFamily: "var(--font-display)",
      }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ color: "var(--text-light)", fontStyle: "italic", fontSize: 14 }}>{emptyText}</div>
      ) : items.map((ref) => (
        <div key={ref.sceneId} style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-light)",
          background: "var(--surface)",
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {ref.actLabel} • {ref.sceneLabel}
            </div>
            {ref.location && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{ref.location}</div>}
          </div>
          <Link
            className="btn btn-ghost btn-sm"
            to={`/read/${workSlug}?line=${Math.max(1, ref.lineStart || 1)}`}
            style={{ whiteSpace: "nowrap", color: "var(--accent)" }}
          >
            Open Text →
          </Link>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({
  workSlug,
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  edgeMode,
  onSelectNode,
  onSelectEdge,
}) {
  if (selectedEdge) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--text-light)",
            fontFamily: "var(--font-display)",
            marginBottom: 6,
          }}>
            Connection
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)", lineHeight: 1.2 }}>
            {selectedEdge.sourceName} ⇄ {selectedEdge.targetName}
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 6 }}>
            {selectedEdge.coPresenceCount} shared scenes and {selectedEdge.exchangeCount} turn exchanges in the current scope.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {statCard(edgeMode === "turn_exchange" ? "Visible Weight" : "Visible Weight", selectedEdge.weight)}
          {statCard("Shared Scenes", selectedEdge.coPresenceCount)}
          {statCard("Turn Exchanges", selectedEdge.exchangeCount)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onSelectNode(selectedEdge.sourceId)}>
            Focus {selectedEdge.sourceName}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onSelectNode(selectedEdge.targetId)}>
            Focus {selectedEdge.targetName}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onSelectEdge("")} style={{ color: "var(--text-light)" }}>
            Clear Connection
          </button>
        </div>

        <SceneLinkList
          refs={selectedEdge.sceneRefs}
          workSlug={workSlug}
          title="Shared Scenes"
          emptyText="No scenes recorded for this connection."
        />
      </div>
    );
  }

  if (selectedNode) {
    const relatedEdges = edges
      .filter((edge) => edge.sourceId === selectedNode.id || edge.targetId === selectedNode.id)
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return (b.exchangeCount + b.coPresenceCount) - (a.exchangeCount + a.coPresenceCount);
      });
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <div style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--text-light)",
            fontFamily: "var(--font-display)",
            marginBottom: 6,
          }}>
            Character
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1.15 }}>
            {selectedNode.name}
          </div>
          {selectedNode.desc && (
            <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginTop: 8 }}>
              {selectedNode.desc}
            </div>
          )}
          {!selectedNode.desc && selectedNode.inferred && (
            <div style={{ fontSize: 14, color: "var(--text-light)", lineHeight: 1.6, marginTop: 8, fontStyle: "italic" }}>
              This figure was inferred from speech labels rather than a cast entry.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {statCard("Scenes", selectedNode.scenes)}
          {statCard("Speaking Scenes", selectedNode.speakingScenes)}
          {statCard("Speeches", selectedNode.speechCount)}
          {statCard("Lines", selectedNode.lineCount)}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--text-light)",
            fontFamily: "var(--font-display)",
          }}>
            Strongest Connections
          </div>
          {relatedEdges.length === 0 ? (
            <div style={{ fontSize: 14, color: "var(--text-light)", fontStyle: "italic" }}>No visible connections in this scope.</div>
          ) : relatedEdges.slice(0, 8).map((edge) => {
            const otherName = edge.sourceId === selectedNode.id ? edge.targetName : edge.sourceName;
            return (
              <button
                key={edge.id}
                className="btn btn-secondary"
                onClick={() => onSelectEdge(edge.id)}
                style={{ textAlign: "left", padding: "10px 12px" }}
              >
                <span style={{ display: "block", color: "var(--text)", fontFamily: "var(--font-display)" }}>{otherName}</span>
                <span style={{ fontSize: 12, color: "var(--text-light)" }}>
                  {edge.weight} visible • {edge.coPresenceCount} scenes • {edge.exchangeCount} exchanges
                </span>
              </button>
            );
          })}
        </div>

        <SceneLinkList
          refs={selectedNode.sceneRefs}
          workSlug={workSlug}
          title="Scene Appearances"
          emptyText="This character has no recorded appearances in the current scope."
        />
      </div>
    );
  }

  const strongestEdges = [...edges].sort((a, b) => b.weight - a.weight).slice(0, 8);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "var(--text-light)",
          fontFamily: "var(--font-display)",
          marginBottom: 6,
        }}>
          Scope Summary
        </div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
          Select a character or edge to inspect how that figure moves through the current act or scene. Use the reader links below to jump back into the text.
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "var(--text-light)",
          fontFamily: "var(--font-display)",
        }}>
          Most Connected Figures
        </div>
        {nodes.slice(0, 10).map((node) => (
          <button
            key={node.id}
            className="btn btn-secondary"
            onClick={() => onSelectNode(node.id)}
            style={{ textAlign: "left", padding: "10px 12px" }}
          >
            <span style={{ display: "block", color: "var(--text)", fontFamily: "var(--font-display)" }}>{node.name}</span>
            <span style={{ fontSize: 12, color: "var(--text-light)" }}>
              {node.connectionWeight} visible ties • {node.lineCount} spoken lines
            </span>
          </button>
        ))}
        {!nodes.length && <div style={{ color: "var(--text-light)", fontStyle: "italic", fontSize: 14 }}>No figures available.</div>}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "var(--text-light)",
          fontFamily: "var(--font-display)",
        }}>
          Strongest Visible Ties
        </div>
        {strongestEdges.length === 0 ? (
          <div style={{ color: "var(--text-light)", fontStyle: "italic", fontSize: 14 }}>No visible edges in this scope.</div>
        ) : strongestEdges.map((edge) => (
          <button
            key={edge.id}
            className="btn btn-secondary"
            onClick={() => onSelectEdge(edge.id)}
            style={{ textAlign: "left", padding: "10px 12px" }}
          >
            <span style={{ display: "block", color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {edge.sourceName} ⇄ {edge.targetName}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-light)" }}>
              {edge.weight} visible • {edge.coPresenceCount} shared scenes • {edge.exchangeCount} exchanges
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [works, setWorks] = useState([]);
  const [selectedWorkSlug, setSelectedWorkSlug] = useState(() => searchParams.get("work") || "");
  const [selectedActId, setSelectedActId] = useState(() => searchParams.get("act") || "all");
  const [selectedSceneId, setSelectedSceneId] = useState(() => searchParams.get("scene") || "all");
  const [edgeMode, setEdgeMode] = useState(() => searchParams.get("mode") === "turns" ? "turn_exchange" : "co_present");
  const [minWeight, setMinWeight] = useState(() => {
    const raw = parseInt(searchParams.get("min") || "1", 10);
    return Number.isFinite(raw) ? clamp(raw, 1, 12) : 1;
  });
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [work, setWork] = useState(null);
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workLoading, setWorkLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    worksApi.list()
      .then((data) => {
        if (cancelled) return;
        const playableWorks = (data || []).filter((item) => item.has_content && item.category !== "poetry");
        setWorks(playableWorks);
        setSelectedWorkSlug((prev) => {
          if (prev && playableWorks.some((item) => item.slug === prev)) return prev;
          const fromQuery = searchParams.get("work");
          if (fromQuery && playableWorks.some((item) => item.slug === fromQuery)) return fromQuery;
          return playableWorks[0]?.slug || "";
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load works.");
        toast?.error(err.message || "Could not load works.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (!selectedWorkSlug) {
      setWork(null);
      setGraph(null);
      return;
    }
    let cancelled = false;
    setWorkLoading(true);
    setError("");
    worksApi.get(selectedWorkSlug)
      .then((data) => {
        if (cancelled) return;
        setWork(data);
        const nextGraph = buildPeopleGraphFromXML(data.content || "", data.title, data.category);
        if (nextGraph.type !== "play") {
          setGraph(null);
          setError("People view is available for plays with structured dramatic scenes.");
          return;
        }
        setGraph(nextGraph);
      })
      .catch((err) => {
        if (cancelled) return;
        setWork(null);
        setGraph(null);
        setError(err.message || "Could not load this play.");
        toast?.error(err.message || "Could not load this play.");
      })
      .finally(() => {
        if (!cancelled) setWorkLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedWorkSlug, toast]);

  useEffect(() => {
    if (!graph?.acts?.length) {
      setSelectedActId("all");
      setSelectedSceneId("all");
      return;
    }
    setSelectedActId((prev) => (prev === "all" || graph.acts.some((act) => act.id === prev) ? prev : "all"));
  }, [graph]);

  const selectedAct = useMemo(
    () => graph?.acts?.find((act) => act.id === selectedActId) || null,
    [graph, selectedActId],
  );

  const sceneOptions = useMemo(() => {
    if (!graph?.acts?.length) return [];
    return selectedAct ? selectedAct.scenes : graph.acts.flatMap((act) => act.scenes);
  }, [graph, selectedAct]);

  useEffect(() => {
    if (selectedSceneId === "all") return;
    if (!sceneOptions.some((scene) => scene.id === selectedSceneId)) setSelectedSceneId("all");
  }, [sceneOptions, selectedSceneId]);

  useEffect(() => {
    setSelectedNodeId("");
    setSelectedEdgeId("");
  }, [selectedWorkSlug, selectedActId, selectedSceneId, edgeMode, minWeight]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedWorkSlug) next.set("work", selectedWorkSlug);
    if (selectedActId !== "all") next.set("act", selectedActId);
    if (selectedSceneId !== "all") next.set("scene", selectedSceneId);
    if (edgeMode === "turn_exchange") next.set("mode", "turns");
    if (minWeight > 1) next.set("min", String(minWeight));
    setSearchParams(next, { replace: true });
  }, [selectedWorkSlug, selectedActId, selectedSceneId, edgeMode, minWeight, setSearchParams]);

  const network = useMemo(
    () => buildPeopleNetwork(graph, { actId: selectedActId, sceneId: selectedSceneId, edgeMode }),
    [graph, selectedActId, selectedSceneId, edgeMode],
  );

  const visibleEdges = useMemo(
    () => network.edges.filter((edge) => edge.weight >= minWeight),
    [network.edges, minWeight],
  );

  const visibleNodeIds = useMemo(() => {
    const ids = new Set(network.nodes.map((node) => node.id));
    visibleEdges.forEach((edge) => {
      ids.add(edge.sourceId);
      ids.add(edge.targetId);
    });
    return ids;
  }, [network.nodes, visibleEdges]);

  const visibleNodes = useMemo(
    () => network.nodes.filter((node) => visibleNodeIds.has(node.id)),
    [network.nodes, visibleNodeIds],
  );

  useEffect(() => {
    if (selectedNodeId && !visibleNodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId("");
  }, [selectedNodeId, visibleNodes]);

  useEffect(() => {
    if (selectedEdgeId && !visibleEdges.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId("");
  }, [selectedEdgeId, visibleEdges]);

  const selectedNode = visibleNodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = visibleEdges.find((edge) => edge.id === selectedEdgeId) || null;
  const peopleById = useMemo(
    () => new Map((graph?.people || []).map((person) => [person.id, person])),
    [graph],
  );

  const sceneBrowserScenes = selectedAct ? selectedAct.scenes : graph?.acts?.flatMap((act) => act.scenes) || [];
  const currentWorkTitle = work?.title || "People in the Plays";

  if (loading) {
    return <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" /></div>;
  }

  return (
    <div className="animate-in" style={{ maxWidth: 1280, margin: "0 auto", padding: "36px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontFamily: "var(--font-display)", letterSpacing: 2, color: "var(--gold)", fontSize: 12, textTransform: "uppercase", marginBottom: 8 }}>
          <EvaLabel jp="人物" className="eva-bilingual--meta">People</EvaLabel>
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", fontWeight: 400, letterSpacing: 2, marginBottom: 8 }}>
          <EvaLabel jp="登場人物網" className="eva-bilingual--hero">People in the Plays</EvaLabel>
        </h1>
        <p style={{ maxWidth: 760, margin: "0 auto", color: "var(--text-muted)", lineHeight: 1.7, fontSize: 16 }}>
          Explore who appears together, who exchanges turns, and how a play’s social structure shifts by act and scene.
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border-light)",
        borderRadius: 16,
        marginBottom: 20,
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
            Play
          </div>
          <select
            className="input"
            value={selectedWorkSlug}
            onChange={(event) => setSelectedWorkSlug(event.target.value)}
            disabled={!works.length}
          >
            {works.map((item) => (
              <option key={item.slug} value={item.slug}>{item.title}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
            Act
          </div>
          <select
            className="input"
            value={selectedActId}
            onChange={(event) => {
              setSelectedActId(event.target.value);
              setSelectedSceneId("all");
            }}
            disabled={!graph}
          >
            <option value="all">All Acts</option>
            {(graph?.acts || []).map((act) => (
              <option key={act.id} value={act.id}>{act.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
            Scene
          </div>
          <select
            className="input"
            value={selectedSceneId}
            onChange={(event) => setSelectedSceneId(event.target.value)}
            disabled={!sceneOptions.length}
          >
            <option value="all">{selectedAct ? "All Scenes in Act" : "All Scenes"}</option>
            {sceneOptions.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {selectedAct ? scene.label : `${scene.actLabel} • ${scene.label}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
            Edge Mode
          </div>
          <div style={{ display: "flex", border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden", height: 44 }}>
            <button
              className="btn"
              onClick={() => setEdgeMode("co_present")}
              style={{
                flex: 1,
                borderRadius: 0,
                background: edgeMode === "co_present" ? "var(--accent)" : "var(--surface)",
                color: edgeMode === "co_present" ? "var(--accent-contrast)" : "var(--text-muted)",
                fontFamily: "var(--font-display)",
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              Shared Scenes
            </button>
            <button
              className="btn"
              onClick={() => setEdgeMode("turn_exchange")}
              style={{
                flex: 1,
                borderRadius: 0,
                background: edgeMode === "turn_exchange" ? "var(--gold)" : "var(--surface)",
                color: edgeMode === "turn_exchange" ? "var(--gold-contrast)" : "var(--text-muted)",
                fontFamily: "var(--font-display)",
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              Turn Exchanges
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
            Minimum Edge Weight
          </div>
          <div style={{
            height: 44,
            padding: "0 12px",
            borderRadius: 8,
            border: "1px solid var(--border-light)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <input
              type="range"
              min="1"
              max="12"
              value={minWeight}
              onChange={(event) => setMinWeight(parseInt(event.target.value, 10))}
              style={{ flex: 1 }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)", minWidth: 18 }}>{minWeight}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--accent)" }}>{currentWorkTitle}</div>
          <div style={{ color: "var(--text-light)", fontSize: 14, lineHeight: 1.6 }}>
            {selectedAct ? selectedAct.label : "All acts"}
            {selectedSceneId !== "all" && network.scenes[0] ? ` • ${network.scenes[0].label}` : ""}
            {work?.variant ? ` • ${work.variant}` : ""}
          </div>
        </div>
        {selectedWorkSlug && (
          <Link className="btn btn-secondary" to={`/read/${selectedWorkSlug}`}>
            Open Play Text
          </Link>
        )}
      </div>

      {workLoading && (
        <div style={{ padding: 60, textAlign: "center" }}><div className="spinner" /></div>
      )}

      {!workLoading && error && (
        <div style={{
          padding: "18px 20px",
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 12,
          color: "var(--danger)",
          marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {!workLoading && !error && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            {statCard("Scenes in Scope", network.stats.sceneCount, selectedSceneId === "all" ? "Current act or play selection." : "Single-scene focus.")}
            {statCard("Characters", visibleNodes.length, visibleNodes.length === network.nodes.length ? "All visible figures." : `${network.nodes.length} total in scope.`)}
            {statCard("Visible Edges", visibleEdges.length, minWeight > 1 ? `Filtered to weight ${minWeight}+.` : "No weight filter applied.")}
            {statCard(edgeMode === "turn_exchange" ? "Turn Exchanges" : "Scene Overlaps", visibleEdges.reduce((sum, edge) => sum + edge.weight, 0), edgeMode === "turn_exchange" ? "Consecutive speaker handoffs." : "Pairwise scene co-presence.")}
          </div>

          <div className="people-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.9fr) minmax(320px, 1fr)", gap: 18, alignItems: "start" }}>
            <GraphPanel
              nodes={visibleNodes}
              edges={visibleEdges}
              edgeMode={edgeMode}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
            />

            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border-light)",
              borderRadius: 16,
              padding: 18,
              display: "grid",
              gap: 16,
            }}>
              <DetailPanel
                workSlug={selectedWorkSlug}
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                nodes={visibleNodes}
                edges={visibleEdges}
                edgeMode={edgeMode}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
              />
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--accent)" }}>
                  Scene Breakdown
                </div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Use the scene cards to narrow the graph or jump directly into the play text.
                </div>
              </div>
              {selectedSceneId !== "all" && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedSceneId("all")} style={{ color: "var(--text-light)" }}>
                  Show All Scenes
                </button>
              )}
            </div>

            <div className="people-scene-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {sceneBrowserScenes.map((scene) => {
                const participantNames = scene.participants
                  .map((id) => peopleById.get(id)?.name || id)
                  .sort((a, b) => a.localeCompare(b));
                const isActive = selectedSceneId === scene.id;
                return (
                  <div
                    key={scene.id}
                    style={{
                      border: isActive ? "1px solid var(--accent)" : "1px solid var(--border-light)",
                      borderRadius: 12,
                      background: isActive ? "var(--accent-faint)" : "var(--surface)",
                      padding: 14,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", color: "var(--accent)", fontSize: 16, marginBottom: 4 }}>
                        {selectedAct ? scene.label : `${scene.actLabel} • ${scene.label}`}
                      </div>
                      {scene.location && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{scene.location}</div>}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="tag-chip" style={{ background: "var(--gold-faint)", color: "var(--gold)" }}>
                        {scene.participants.length} people
                      </span>
                      <span className="tag-chip" style={{ background: "var(--accent-faint)", color: "var(--accent)" }}>
                        {scene.speeches.length} speeches
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      {participantNames.length ? participantNames.slice(0, 8).join(", ") : "No recognizable named figures in this scene."}
                      {participantNames.length > 8 ? `, +${participantNames.length - 8} more` : ""}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSceneId(isActive ? "all" : scene.id)}>
                        {isActive ? "Remove Scene Focus" : "Focus Scene"}
                      </button>
                      <Link className="btn btn-ghost btn-sm" to={`/read/${selectedWorkSlug}?line=${Math.max(1, scene.startLine || 1)}`} style={{ color: "var(--accent)" }}>
                        Open Text →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
