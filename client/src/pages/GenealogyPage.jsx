import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  HISTORY_GENEALOGY_EDGES,
  HISTORY_GENEALOGY_HOUSES,
  HISTORY_GENEALOGY_NODES,
  HISTORY_GENEALOGY_PLAYS,
  HISTORY_GENEALOGY_REGNAL_LINE,
  getHistoryPlayTitle,
} from "../lib/historyGenealogy";

const MAP_WIDTH = 3400;
const MAP_HEIGHT = 1320;
const NODE_WIDTH = 164;
const NODE_HEIGHT = 64;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.5;
const DEFAULT_ZOOM = 0.7;

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

function buildRelationIndex(edges) {
  const parentToChildren = new Map();
  const childToParents = new Map();
  const spouses = new Map();

  edges.forEach((edge) => {
    if (edge.type === "parent") {
      if (!parentToChildren.has(edge.source)) parentToChildren.set(edge.source, []);
      if (!childToParents.has(edge.target)) childToParents.set(edge.target, []);
      parentToChildren.get(edge.source).push(edge.target);
      childToParents.get(edge.target).push(edge.source);
    }
    if (edge.type === "spouse") {
      if (!spouses.has(edge.source)) spouses.set(edge.source, []);
      if (!spouses.has(edge.target)) spouses.set(edge.target, []);
      spouses.get(edge.source).push(edge.target);
      spouses.get(edge.target).push(edge.source);
    }
  });

  return { parentToChildren, childToParents, spouses };
}

function buildVisibleSet(selectedWork, showContext) {
  if (selectedWork === "all" || showContext) {
    return new Set(HISTORY_GENEALOGY_NODES.map((node) => node.id));
  }
  return new Set(
    HISTORY_GENEALOGY_NODES
      .filter((node) => node.workSlugs.includes(selectedWork))
      .map((node) => node.id),
  );
}

function relationStroke(edge) {
  if (edge.type === "spouse") return "var(--gold)";
  return "var(--border)";
}

function relationDash(edge) {
  return edge.type === "spouse" ? "10 7" : "";
}

function DetailList({ label, items }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((item) => (
          <span
            key={item.id}
            style={{
              display: "inline-flex",
              padding: "5px 10px",
              borderRadius: 999,
              background: "var(--bg)",
              border: "1px solid var(--border-light)",
              fontSize: 13,
              color: "var(--text)",
            }}
          >
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function GenealogyMap({
  nodes,
  edges,
  selectedNodeId,
  selectedWork,
  showContext,
  zoom,
  onZoomChange,
  onResetZoom,
  onSelectNode,
}) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const neighborIds = useMemo(() => {
    if (!selectedNode) return new Set();
    const set = new Set();
    edges.forEach((edge) => {
      if (edge.source === selectedNode.id) set.add(edge.target);
      if (edge.target === selectedNode.id) set.add(edge.source);
    });
    return set;
  }, [edges, selectedNode]);

  return (
    <div style={{
      background: "linear-gradient(180deg, var(--surface) 0%, rgba(255,255,255,0) 100%)",
      border: "1px solid var(--border-light)",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: "1px solid var(--border-light)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)", letterSpacing: 1 }}>
            Dynastic Map
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {selectedWork === "all"
              ? "All principal figures and contextual connectors in Shakespeare's English histories."
              : showContext
                ? `${getHistoryPlayTitle(selectedWork)} highlighted against the wider family tree.`
                : `${getHistoryPlayTitle(selectedWork)} only, without contextual ancestors or descendants.`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onZoomChange(clampZoom(zoom - 0.1))}>
            −
          </button>
          <div style={{ minWidth: 58, textAlign: "center", fontSize: 12, color: "var(--text-light)", fontFamily: "var(--font-display)", letterSpacing: 1 }}>
            {Math.round(zoom * 100)}%
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onZoomChange(clampZoom(zoom + 0.1))}>
            +
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(clampZoom(Number(event.target.value) || DEFAULT_ZOOM))}
            style={{ width: 120 }}
          />
          <button className="btn btn-ghost btn-sm" onClick={onResetZoom} style={{ color: "var(--text-light)" }}>
            Fit
          </button>
          {selectedNode && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onSelectNode("")}
              style={{ color: "var(--text-light)" }}
            >
              Clear Focus
            </button>
          )}
        </div>
      </div>

      <div style={{ overflow: "auto", maxHeight: 760 }}>
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          style={{
            display: "block",
            width: `${Math.round(MAP_WIDTH * zoom)}px`,
            height: `${Math.round(MAP_HEIGHT * zoom)}px`,
            background: "radial-gradient(circle at top, rgba(201,168,76,0.07), transparent 32%)",
          }}
        >
          {edges.map((edge) => {
            const source = nodes.find((node) => node.id === edge.source);
            const target = nodes.find((node) => node.id === edge.target);
            if (!source || !target) return null;
            const touchesSelected = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
            const touchesPlay = selectedWork === "all" || source.workSlugs.includes(selectedWork) || target.workSlugs.includes(selectedWork);
            const faded = selectedNode ? !touchesSelected : (selectedWork !== "all" && showContext && !touchesPlay);
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={relationStroke(edge)}
                strokeWidth={touchesSelected ? 5 : edge.type === "spouse" ? 3.5 : 3}
                strokeDasharray={relationDash(edge)}
                opacity={faded ? 0.12 : touchesSelected ? 0.95 : 0.62}
                strokeLinecap="round"
              />
            );
          })}

          {nodes.map((node) => {
            const house = HISTORY_GENEALOGY_HOUSES[node.house] || HISTORY_GENEALOGY_HOUSES.context;
            const isSelected = node.id === selectedNodeId;
            const isInPlay = selectedWork === "all" || node.workSlugs.includes(selectedWork);
            const isNeighbor = neighborIds.has(node.id);
            const faded = selectedNode
              ? !(isSelected || isNeighbor)
              : (selectedWork !== "all" && showContext && !isInPlay);
            const opacity = faded ? 0.28 : 1;
            const lines = String(node.displayName || node.name).split("\n");
            const lineGap = 18;
            const startY = (NODE_HEIGHT / 2) - ((lines.length - 1) * lineGap) / 2;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`}
                onClick={() => onSelectNode(node.id)}
                style={{ cursor: "pointer", opacity, transition: "opacity 0.15s ease" }}
              >
                <rect
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="14"
                  fill={house.fill}
                  stroke={isSelected ? "var(--gold-light)" : house.stroke}
                  strokeWidth={isSelected ? 4 : 2}
                  style={{ filter: isSelected ? "drop-shadow(0 0 14px rgba(201,168,76,0.28))" : "drop-shadow(0 10px 20px rgba(0,0,0,0.09))" }}
                />
                {!isInPlay && selectedWork !== "all" && showContext && (
                  <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx="14" fill="rgba(255,255,255,0.22)" />
                )}
                <text
                  x={NODE_WIDTH / 2}
                  y={startY}
                  fill={house.text}
                  fontSize="18"
                  fontFamily="var(--font-display)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {lines.map((line, index) => (
                    <tspan key={`${node.id}-${index}`} x={NODE_WIDTH / 2} dy={index === 0 ? 0 : lineGap}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <text x={NODE_WIDTH - 12} y={16} textAnchor="end" fill={house.text} fontSize="9.5" opacity="0.86" fontFamily="var(--font-display)" letterSpacing="1.1">
                  {house.shortLabel.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function GenealogyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const selectedWork = searchParams.get("work") || "all";
  const showContext = searchParams.get("context") !== "0";

  const nodesById = useMemo(
    () => new Map(HISTORY_GENEALOGY_NODES.map((node) => [node.id, node])),
    [],
  );
  const relationIndex = useMemo(
    () => buildRelationIndex(HISTORY_GENEALOGY_EDGES),
    [],
  );
  const visibleSet = useMemo(
    () => buildVisibleSet(selectedWork, showContext),
    [selectedWork, showContext],
  );
  const visibleNodes = useMemo(
    () => HISTORY_GENEALOGY_NODES.filter((node) => visibleSet.has(node.id)),
    [visibleSet],
  );
  const visibleEdges = useMemo(
    () => HISTORY_GENEALOGY_EDGES.filter((edge) => visibleSet.has(edge.source) && visibleSet.has(edge.target)),
    [visibleSet],
  );
  const highlightedCount = useMemo(
    () => selectedWork === "all" ? visibleNodes.length : visibleNodes.filter((node) => node.workSlugs.includes(selectedWork)).length,
    [selectedWork, visibleNodes],
  );
  const selectedNode = visibleNodes.find((node) => node.id === selectedNodeId) || null;

  useEffect(() => {
    if (selectedNodeId && !visibleSet.has(selectedNodeId)) {
      setSelectedNodeId("");
    }
  }, [selectedNodeId, visibleSet]);

  useEffect(() => {
    if (selectedWork === "all") {
      setSelectedNodeId("edward-iii");
      return;
    }
    const firstMatch = HISTORY_GENEALOGY_NODES.find((node) => node.workSlugs.includes(selectedWork));
    setSelectedNodeId(firstMatch?.id || "");
  }, [selectedWork]);

  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
  }, [selectedWork, showContext]);

  const selectedParents = useMemo(
    () => (selectedNode ? (relationIndex.childToParents.get(selectedNode.id) || []).map((id) => nodesById.get(id)).filter(Boolean) : []),
    [nodesById, relationIndex.childToParents, selectedNode],
  );
  const selectedChildren = useMemo(
    () => (selectedNode ? (relationIndex.parentToChildren.get(selectedNode.id) || []).map((id) => nodesById.get(id)).filter(Boolean) : []),
    [nodesById, relationIndex.parentToChildren, selectedNode],
  );
  const selectedSpouses = useMemo(
    () => (selectedNode ? (relationIndex.spouses.get(selectedNode.id) || []).map((id) => nodesById.get(id)).filter(Boolean) : []),
    [nodesById, relationIndex.spouses, selectedNode],
  );

  const regnalNodes = HISTORY_GENEALOGY_REGNAL_LINE.map((id) => nodesById.get(id)).filter(Boolean);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="animate-in" style={{ maxWidth: 1380, margin: "0 auto", padding: "26px 24px 40px" }}>
      <div style={{ maxWidth: 860, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
          Historical Genealogy
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 34, color: "var(--accent)", letterSpacing: 1.2 }}>
          Genealogy of the English Kings
        </h1>
        <p style={{ margin: "12px 0 0", color: "var(--text-muted)", lineHeight: 1.72, fontSize: 15 }}>
          A curated dynastic guide to the real historical figures behind Shakespeare's English histories. Choose a play to highlight its onstage figures against the larger family tree, or strip the map down to only that play's characters.
        </p>
      </div>

      <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={selectedWork === "all" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => updateParam("work", "all")}
          >
            All histories
          </button>
          {HISTORY_GENEALOGY_PLAYS.map((play) => (
            <button
              key={play.slug}
              className={selectedWork === play.slug ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
              onClick={() => updateParam("work", play.slug)}
            >
              {play.title}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={showContext}
              onChange={(event) => updateParam("context", event.target.checked ? "" : "0")}
            />
            Show contextual ancestors, spouses, and descendants
          </label>
          {selectedWork !== "all" && (
            <Link className="btn btn-ghost btn-sm" to={`/read/${selectedWork}`}>
              Open {getHistoryPlayTitle(selectedWork)}
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: 22 }}>
        {statCard("Visible Figures", visibleNodes.length, selectedWork === "all" ? "Principal dynastic figures plus contextual connectors." : "Adjusted by play filter and context setting.")}
        {statCard("Relations", visibleEdges.length, "Parent-child ties and marriages." )}
        {statCard("Highlighted", highlightedCount, selectedWork === "all" ? "All history-cycle figures currently in view." : `Figures who appear in ${getHistoryPlayTitle(selectedWork)}.`)}
      </div>

      <div style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        marginBottom: 20,
      }}>
        {regnalNodes.map((node, index) => {
          const house = HISTORY_GENEALOGY_HOUSES[node.house] || HISTORY_GENEALOGY_HOUSES.context;
          const isInPlay = selectedWork === "all" || node.workSlugs.includes(selectedWork);
          return (
            <button
              key={node.id}
              className="btn"
              onClick={() => setSelectedNodeId(node.id)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                background: house.fill,
                color: house.text,
                border: selectedNodeId === node.id ? "2px solid var(--gold-light)" : `1px solid ${house.stroke}`,
                borderRadius: 12,
                opacity: selectedWork !== "all" && showContext && !isInPlay ? 0.45 : 1,
                boxShadow: selectedNodeId === node.id ? "0 0 0 3px rgba(201,168,76,0.14)" : "none",
              }}
            >
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, lineHeight: 1.25 }}>{node.name}</div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.84 }}>{node.role}</div>
              {index < regnalNodes.length - 1 && (
                <div style={{ fontSize: 11, marginTop: 6, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.82 }}>
                  Then →
                </div>
              )}
            </button>
          );
        })}
      </div>

      <GenealogyMap
        nodes={visibleNodes}
        edges={visibleEdges}
        selectedNodeId={selectedNodeId}
        selectedWork={selectedWork}
        showContext={showContext}
        zoom={zoom}
        onZoomChange={setZoom}
        onResetZoom={() => setZoom(DEFAULT_ZOOM)}
        onSelectNode={setSelectedNodeId}
      />

      <div style={{ display: "grid", gap: 16, marginTop: 18, gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)" }}>
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 16,
          padding: 18,
          display: "grid",
          gap: 12,
        }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--accent)", letterSpacing: 1 }}>
            Legend
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(HISTORY_GENEALOGY_HOUSES).map(([key, house]) => (
              <span
                key={key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "var(--bg)",
                  border: "1px solid var(--border-light)",
                  fontSize: 13,
                  color: "var(--text)",
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: 999, background: house.fill, border: `1px solid ${house.stroke}` }} />
                {house.label}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 0, borderTop: "3px solid var(--border)" }} />
              Parent / child
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 0, borderTop: "3px dashed var(--gold)" }} />
              Marriage
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-muted)" }}>
            Figures highlighted by the selected play are fully opaque. If contextual figures are turned on, the surrounding dynasty remains visible but dimmed so you can see where the onstage characters sit inside the larger succession crisis.
          </div>
        </div>

        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 16,
          padding: 18,
          display: "grid",
          gap: 14,
          alignContent: "start",
        }}>
          {selectedNode ? (
            <>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--gold)", fontFamily: "var(--font-display)", marginBottom: 6 }}>
                  Selected Figure
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--accent)", lineHeight: 1.15 }}>
                  {selectedNode.name}
                </div>
                <div style={{ marginTop: 4, color: "var(--text-light)", fontSize: 14 }}>
                  {selectedNode.role}
                </div>
              </div>

              <div style={{ fontSize: 14, lineHeight: 1.72, color: "var(--text)" }}>
                {selectedNode.summary}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--text-light)", fontFamily: "var(--font-display)" }}>
                  Appears In
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedNode.workSlugs.length ? selectedNode.workSlugs.map((slug) => (
                    <Link key={slug} className="btn btn-secondary btn-sm" to={`/read/${slug}`}>
                      {getHistoryPlayTitle(slug)}
                    </Link>
                  )) : (
                    <span style={{ color: "var(--text-light)", fontSize: 13 }}>Context only</span>
                  )}
                </div>
              </div>

              <DetailList label="Parents" items={selectedParents} />
              <DetailList label="Spouses" items={selectedSpouses} />
              <DetailList label="Children" items={selectedChildren} />
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--accent)" }}>
                Select a figure
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.72, color: "var(--text-muted)" }}>
                Click any node in the map to see that figure's direct relations, play appearances, and dynastic role.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
