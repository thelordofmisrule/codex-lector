import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import ForceGraph2D from "react-force-graph-2d";
import SpriteText from "three-spritetext";
import * as THREE from "three";

const THEME_VARS = [
  "accent", "accent-light", "gold", "gold-light", "surface",
  "text", "text-muted", "text-light", "border", "bg",
];

function readThemeColors() {
  const style = getComputedStyle(document.documentElement);
  const colors = {};
  THEME_VARS.forEach((name) => {
    colors[name] = style.getPropertyValue(`--${name}`).trim() || "#888888";
  });
  return colors;
}

function useThemeColors() {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readThemeColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const [r, g, b] = match[1].split(",").map((v) => parseFloat(v));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function useContainerSize() {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  return [containerRef, size];
}

function nodeRadius(node) {
  const base = 2 + Math.sqrt(Math.max(1, node.lineCount || 1)) * 0.24 + (node.connectionWeight || 0) * 0.02;
  return Math.min(6.5, Math.max(2, base));
}

export default function CharacterNetworkGraph({
  nodes,
  edges,
  viewMode,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}) {
  const colors = useThemeColors();
  const [containerRef, size] = useContainerSize();
  const graphRef = useRef(null);
  const hasAutoFittedRef = useRef(false);

  const graphData = useMemo(() => ({
    nodes: nodes.map((node) => ({ ...node })),
    links: edges.map((edge) => ({
      ...edge,
      source: edge.sourceId,
      target: edge.targetId,
    })),
  }), [nodes, edges]);

  const maxWeight = useMemo(
    () => Math.max(1, ...edges.map((edge) => edge.weight || 0)),
    [edges],
  );

  const neighborIds = useMemo(() => {
    const ids = new Set();
    if (!selectedNodeId) return ids;
    edges.forEach((edge) => {
      if (edge.sourceId === selectedNodeId) ids.add(edge.targetId);
      if (edge.targetId === selectedNodeId) ids.add(edge.sourceId);
    });
    return ids;
  }, [edges, selectedNodeId]);

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((edge) => edge.id === selectedEdgeId) || null : null),
    [edges, selectedEdgeId],
  );

  const hasFocus = !!(selectedNodeId || selectedEdge);

  function nodeState(nodeId) {
    if (selectedNodeId) {
      if (nodeId === selectedNodeId) return "selected";
      if (neighborIds.has(nodeId)) return "neighbor";
      return "muted";
    }
    if (selectedEdge) {
      if (nodeId === selectedEdge.sourceId || nodeId === selectedEdge.targetId) return "selected";
      return "muted";
    }
    return "normal";
  }

  function linkState(link) {
    const sourceId = typeof link.source === "object" ? link.source.id : link.source;
    const targetId = typeof link.target === "object" ? link.target.id : link.target;
    if (selectedEdge) return link.id === selectedEdge.id ? "selected" : "muted";
    if (selectedNodeId) {
      return sourceId === selectedNodeId || targetId === selectedNodeId ? "selected" : "muted";
    }
    return "normal";
  }

  const nodeColorFor = useCallback((state) => {
    if (state === "selected") return colors.accent;
    if (state === "neighbor") return colors.gold;
    if (state === "muted") return withAlpha(colors["text-light"], 0.18);
    return colors.gold;
  }, [colors]);

  const linkColor = useCallback((link) => {
    const state = linkState(link);
    if (state === "selected") return colors.accent;
    if (state === "muted") return withAlpha(colors.border, 0.08);
    const strength = 0.25 + 0.55 * ((link.weight || 1) / maxWeight);
    return withAlpha(colors.border, strength);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, maxWeight, selectedNodeId, selectedEdgeId]);

  const linkWidth = useCallback((link) => {
    const state = linkState(link);
    const base = 0.6 + ((link.weight || 1) / maxWeight) * 3;
    return state === "selected" ? base + 1.6 : base;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWeight, selectedNodeId, selectedEdgeId]);

  const nodeLabel = useCallback((node) => `
    <div style="
      font-family: Georgia, serif;
      background: ${colors.surface};
      color: ${colors.text};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 260px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    ">
      <div style="font-size: 15px; color: ${colors.accent}; margin-bottom: 2px;">${node.name}</div>
      <div style="font-size: 12px; color: ${colors["text-muted"]};">
        ${node.lineCount || 0} lines &bull; ${node.scenes || 0} scenes &bull; ${node.connectionWeight || 0} tie strength
      </div>
      <div style="font-size: 11px; color: ${colors["text-light"]}; margin-top: 3px;">Click to focus</div>
    </div>
  `, [colors]);

  const linkLabel = useCallback((link) => `
    <div style="
      font-family: Georgia, serif;
      background: ${colors.surface};
      color: ${colors.text};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 8px 12px;
      max-width: 280px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    ">
      <div style="font-size: 14px; color: ${colors.accent}; margin-bottom: 2px;">
        ${link.sourceName} &#8644; ${link.targetName}
      </div>
      <div style="font-size: 12px; color: ${colors["text-muted"]};">
        ${link.coPresenceCount} shared scenes &bull; ${link.exchangeCount} exchanges
      </div>
      <div style="font-size: 11px; color: ${colors["text-light"]}; margin-top: 3px;">Click to inspect</div>
    </div>
  `, [colors]);

  // Rebuilt whenever colors or the selection changes so highlight state stays in sync.
  const nodeThreeObject = useCallback((node) => {
    const state = nodeState(node.id);
    const radius = nodeRadius(node);
    const group = new THREE.Group();

    const color = nodeColorFor(state);
    const sphereOpacity = state === "muted" ? 0.12 : 0.92;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(state === "muted" ? colors["text-light"] : color.startsWith("rgba") ? colors["text-light"] : color),
      transparent: true,
      opacity: sphereOpacity,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 24), material);
    group.add(sphere);

    if (state === "selected") {
      const haloMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colors["gold-light"]),
        transparent: true,
        opacity: 0.3,
        side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(radius + 2.4, 24, 24), haloMaterial);
      group.add(halo);
    }

    if (state !== "muted") {
      const label = new SpriteText(node.name);
      label.color = state === "selected" ? colors.accent : colors.text;
      label.backgroundColor = withAlpha(colors.surface, 0.85);
      label.padding = 2;
      label.borderRadius = 3;
      label.textHeight = state === "selected" ? 7 : 5;
      label.fontFace = "Georgia";
      label.position.y = radius + (state === "selected" ? 8 : 6.5);
      group.add(label);
    }

    return group;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, selectedNodeId, selectedEdgeId, neighborIds, nodeColorFor]);

  const drawNode2D = useCallback((node, ctx, globalScale) => {
    const state = nodeState(node.id);
    const radius = nodeRadius(node) * 0.85;
    const color = nodeColorFor(state);

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = state === "muted" ? withAlpha(colors["text-light"], 0.12) : color;
    ctx.fill();
    if (state !== "muted") {
      ctx.lineWidth = state === "selected" ? 2 : 1;
      ctx.strokeStyle = state === "selected" ? colors["gold-light"] : withAlpha(colors.accent, 0.7);
      ctx.stroke();
    }

    if (state !== "muted" && globalScale > 0.55) {
      const fontSize = state === "selected" ? 13 / globalScale : 10.5 / globalScale;
      ctx.font = `${state === "selected" ? "600 " : ""}${fontSize}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = node.name;
      const textWidth = ctx.measureText(label).width;
      const pad = 2.5 / globalScale;
      ctx.fillStyle = withAlpha(colors.surface, 0.82);
      ctx.fillRect(node.x - textWidth / 2 - pad, node.y + radius + 1.5, textWidth + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = state === "selected" ? colors.accent : colors.text;
      ctx.fillText(label, node.x, node.y + radius + 1.5 + pad);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, selectedNodeId, selectedEdgeId, neighborIds, nodeColorFor]);

  const paintPointerArea2D = useCallback((node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius(node) * 0.85 + 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const handleNodeClick = useCallback((node) => {
    onSelectEdge("");
    onSelectNode(node.id === selectedNodeId ? "" : node.id);
  }, [onSelectNode, onSelectEdge, selectedNodeId]);

  const handleLinkClick = useCallback((link) => {
    onSelectNode("");
    onSelectEdge(link.id === selectedEdgeId ? "" : link.id);
  }, [onSelectNode, onSelectEdge, selectedEdgeId]);

  const handleBackgroundClick = useCallback(() => {
    onSelectNode("");
    onSelectEdge("");
  }, [onSelectNode, onSelectEdge]);

  // Space nodes out: stronger ties pull closer, everything repels a bit more than default.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(viewMode === "3d" ? -320 : -300);
    const link = fg.d3Force("link");
    if (link) {
      link.distance((l) => {
        const w = (l.weight || 1) / maxWeight;
        return viewMode === "3d" ? 130 - w * 50 : 120 - w * 45;
      });
    }
    hasAutoFittedRef.current = false;
  }, [viewMode, maxWeight, graphData, size.width]);

  // Frame the whole network once the layout settles; dragging reheats the
  // engine, so only do this on the first settle after data or view changes.
  const handleEngineStop = useCallback(() => {
    if (hasAutoFittedRef.current) return;
    hasAutoFittedRef.current = true;
    graphRef.current?.zoomToFit(700, 20);
  }, []);

  // Glide the camera toward the selected character once the layout has settled.
  useEffect(() => {
    if (!selectedNodeId) return undefined;
    const timer = setTimeout(() => {
      const fg = graphRef.current;
      if (!fg) return;
      const node = graphData.nodes.find((n) => n.id === selectedNodeId);
      if (!node || node.x === undefined) return;
      if (viewMode === "3d") {
        const distance = 220;
        const current = Math.hypot(node.x, node.y, node.z || 0) || 1;
        const ratio = 1 + distance / current;
        fg.cameraPosition(
          { x: node.x * ratio, y: node.y * ratio, z: (node.z || 0) * ratio },
          node,
          800,
        );
      } else {
        fg.centerAt(node.x, node.y, 700);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedNodeId, viewMode, graphData]);

  const commonProps = {
    ref: graphRef,
    graphData,
    width: size.width || undefined,
    height: size.height || undefined,
    nodeId: "id",
    nodeVal: (node) => nodeRadius(node),
    nodeLabel,
    linkLabel,
    linkColor,
    linkWidth,
    onNodeClick: handleNodeClick,
    onLinkClick: handleLinkClick,
    onBackgroundClick: handleBackgroundClick,
    linkDirectionalParticles: (link) => (linkState(link) === "selected" ? 3 : 0),
    linkDirectionalParticleWidth: 2.4,
    linkDirectionalParticleColor: () => colors["gold-light"],
    cooldownTicks: 120,
    onEngineStop: handleEngineStop,
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 480, position: "relative", overflow: "hidden", borderRadius: 12 }}
    >
      {size.width > 0 && (viewMode === "3d" ? (
        <ForceGraph3D
          {...commonProps}
          backgroundColor="rgba(0,0,0,0)"
          nodeThreeObject={nodeThreeObject}
          nodeOpacity={1}
          linkOpacity={hasFocus ? 0.85 : 0.55}
          showNavInfo={false}
          enableNodeDrag
        />
      ) : (
        <ForceGraph2D
          {...commonProps}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={drawNode2D}
          nodePointerAreaPaint={paintPointerArea2D}
          autoPauseRedraw={false}
          enableNodeDrag
        />
      ))}
    </div>
  );
}
