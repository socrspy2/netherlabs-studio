import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ruler, Sparkle } from "lucide-react";
import { useEditor, createShapeForTool } from "../../state/editorStore";
import { LayerNode, Shape, TextShape } from "../../state/types";

type DragMode = "none" | "pan" | "marquee" | "creating" | "move" | "resize" | "rotate";

type Marquee = { x: number; y: number; w: number; h: number };

export function CanvasViewport() {
  const { doc, checkpoint, applyShapePatches, setSelection, clearSelection, updateViewport, createShape, rotateSelection } =
    useEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [activeShape, setActiveShape] = useState<Shape | null>(null);
  const startPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragSnapshot = useRef<{
    shapes: Shape[];
    bounds: { x: number; y: number; width: number; height: number } | null;
  }>({ shapes: [], bounds: null });
  const resizeDir = useRef<string | null>(null);
  const rotateCenter = useRef<{ x: number; y: number } | null>(null);
  const dragStartClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rotateStartAngle = useRef<number>(0);

  const selectedShapes = useMemo(() => collectShapes(doc.layers).filter((s) => doc.selection.includes(s.id)), [doc.layers, doc.selection]);

  const selectionBounds = useMemo(() => {
    if (!selectedShapes.length) return null;
    const xs = selectedShapes.map((s) => s.x);
    const ys = selectedShapes.map((s) => s.y);
    const ws = selectedShapes.map((s) => s.x + s.width);
    const hs = selectedShapes.map((s) => s.y + s.height);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...ws) - x;
    const h = Math.max(...hs) - y;
    return { x, y, width: w, height: h, rotation: selectedShapes[0]?.rotation ?? 0 };
  }, [selectedShapes]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setDragMode((m) => (m === "none" ? "pan" : m));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setDragMode("none");
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!containerRef.current) return;
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const nextZoom = clamp(doc.viewport.zoom * zoomFactor, 0.25, 3);
      updateViewport({ zoom: nextZoom });
    };
    const el = containerRef.current;
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => el?.removeEventListener("wheel", onWheel);
  }, [doc.viewport.zoom, updateViewport]);

  const toWorld = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - doc.viewport.pan.x) / doc.viewport.zoom;
    const y = (clientY - rect.top - doc.viewport.pan.y) / doc.viewport.zoom;
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    startPoint.current = world;
    dragStartClient.current = { x: e.clientX, y: e.clientY };

    const isPan = doc.tool === "hand" || e.button === 1 || dragMode === "pan";
    if (isPan) {
      setDragMode("pan");
      return;
    }

    const shapeUnder = hitTest(doc.layers, world.x, world.y);

    // creation tools
    if (["rectangle", "ellipse", "line", "text", "frame"].includes(doc.tool)) {
      const shape = createShapeForTool(doc.tool, world);
      shape.width = 20;
      shape.height = 20;
      setActiveShape(shape);
      setDragMode("creating");
      return;
    }

    if (doc.tool === "select") {
      if (shapeUnder) {
        checkpoint();
        const currentlySelected = new Set(doc.selection);
        const moveSet =
          currentlySelected.has(shapeUnder.id) && selectedShapes.length ? selectedShapes : [shapeUnder];
        setSelection([shapeUnder.id], e.shiftKey);
        dragSnapshot.current = { shapes: moveSet, bounds: selectionBounds };
        setDragMode("move");
      } else {
        clearSelection();
        setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
        setDragMode("marquee");
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    const dx = world.x - startPoint.current.x;
    const dy = world.y - startPoint.current.y;

    if (dragMode === "pan") {
      updateViewport({
        pan: {
          x: doc.viewport.pan.x + e.movementX,
          y: doc.viewport.pan.y + e.movementY,
        },
      });
      return;
    }

    if (dragMode === "creating" && activeShape) {
      const w = Math.max(6, Math.abs(dx));
      const h = Math.max(6, Math.abs(dy));
      const x = dx < 0 ? world.x : activeShape.x;
      const y = dy < 0 ? world.y : activeShape.y;
      setActiveShape({ ...activeShape, x, y, width: w, height: h });
      return;
    }

    if (dragMode === "move") {
      const snap = e.shiftKey ? 10 : 1;
      const totalDx = (e.clientX - dragStartClient.current.x) / doc.viewport.zoom;
      const totalDy = (e.clientY - dragStartClient.current.y) / doc.viewport.zoom;
      const snappedDx = snapTo(totalDx, snap);
      const snappedDy = snapTo(totalDy, snap);
      applyShapePatches(
        dragSnapshot.current.shapes.map((s) => ({
          id: s.id,
          changes: { x: snapTo(s.x + snappedDx, 1), y: snapTo(s.y + snappedDy, 1) },
        })),
        false
      );
      return;
    }

    if (dragMode === "resize" && dragSnapshot.current.bounds && resizeDir.current) {
      const b = dragSnapshot.current.bounds;
      const dir = resizeDir.current;
      const next = { ...b };
      if (dir.includes("e")) {
        next.width = Math.max(4, b.width + dx);
      }
      if (dir.includes("s")) {
        next.height = Math.max(4, b.height + dy);
      }
      if (dir.includes("w")) {
        next.x = b.x + dx;
        next.width = Math.max(4, b.width - dx);
      }
      if (dir.includes("n")) {
        next.y = b.y + dy;
        next.height = Math.max(4, b.height - dy);
      }
      const start = dragSnapshot.current.bounds;
      dragSnapshot.current.bounds = next;

      const sx = next.width / Math.max(1, start.width);
      const sy = next.height / Math.max(1, start.height);
      applyShapePatches(
        dragSnapshot.current.shapes.map((s) => {
          const rx = (s.x - start.x) / Math.max(1, start.width);
          const ry = (s.y - start.y) / Math.max(1, start.height);
          return {
            id: s.id,
            changes: {
              x: next.x + rx * next.width,
              y: next.y + ry * next.height,
              width: Math.max(4, s.width * sx),
              height: Math.max(4, s.height * sy),
            },
          };
        }),
        false
      );
      return;
    }

    if (dragMode === "rotate" && rotateCenter.current) {
      const center = rotateCenter.current;
      const angle = (Math.atan2(world.y - center.y, world.x - center.x) * 180) / Math.PI;
      const delta = angle - rotateStartAngle.current;
      applyShapePatches(
        dragSnapshot.current.shapes.map((s) => {
          const cx = s.x + s.width / 2;
          const cy = s.y + s.height / 2;
          const nextCenter = rotatePoint(cx, cy, center.x, center.y, delta);
          return {
            id: s.id,
            changes: {
              x: nextCenter.x - s.width / 2,
              y: nextCenter.y - s.height / 2,
              rotation: s.rotation + delta,
            },
          };
        }),
        false
      );
      return;
    }

    if (dragMode === "marquee" && marquee) {
      setMarquee({ ...marquee, w: dx, h: dy });
      const hit = hitWithin(doc.layers, marqueeRect(marquee.x, marquee.y, dx, dy));
      setSelection(hit, false);
      return;
    }
  };

  const handlePointerUp = () => {
    if (dragMode === "creating" && activeShape) {
      createShape(activeShape);
      setActiveShape(null);
    }
    setDragMode("none");
    setMarquee(null);
  };

  const zoomLabel = `${Math.round(doc.viewport.zoom * 100)}%`;

  return (
    <div style={{ position: "relative", minHeight: 0, background: "#0b1224" }}>
      <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          <Ruler size={14} />
          <span style={{ fontSize: 12, opacity: 0.8 }}>Snap 10px grid</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          <Sparkle size={14} />
          <span style={{ fontSize: 12, opacity: 0.8 }}>Smart select & handles</span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>Zoom {zoomLabel}</div>
      </div>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          overflow: "hidden",
          background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.04), transparent 26%), #0b1224",
          borderRadius: 16,
          margin: 12,
          border: "1px solid rgba(255,255,255,0.05)",
          minHeight: 0,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `translate(${doc.viewport.pan.x}px, ${doc.viewport.pan.y}px) scale(${doc.viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg width={1800} height={1200} style={{ background: "#0f172a", borderRadius: 12 }}>
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <rect width="10" height="10" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="1800" height="1200" fill="url(#grid)" />
            {doc.layers.map((node) => (
              <LayerNodeShape key={node.id} node={node} selection={doc.selection} onSelect={(id, additive) => setSelection([id], additive)} />
            ))}
            {activeShape && <ShapeElement shape={activeShape} selected />}
            {selectionBounds && (
              <SelectionOutline
                bounds={selectionBounds}
                onResizeStart={(dir, e) => {
                  checkpoint();
                  const world = toWorld(e.clientX, e.clientY);
                  startPoint.current = world;
                  dragStartClient.current = { x: e.clientX, y: e.clientY };
                  resizeDir.current = dir;
                  dragSnapshot.current = { shapes: selectedShapes, bounds: selectionBounds };
                  setDragMode("resize");
                }}
                onRotateStart={(e) => {
                  checkpoint();
                  const world = toWorld(e.clientX, e.clientY);
                  startPoint.current = world;
                  dragStartClient.current = { x: e.clientX, y: e.clientY };
                  rotateCenter.current = {
                    x: selectionBounds.x + selectionBounds.width / 2,
                    y: selectionBounds.y + selectionBounds.height / 2,
                  };
                  rotateStartAngle.current =
                    (Math.atan2(world.y - rotateCenter.current.y, world.x - rotateCenter.current.x) * 180) / Math.PI;
                  dragSnapshot.current = { shapes: selectedShapes, bounds: selectionBounds };
                  setDragMode("rotate");
                }}
              />
            )}
            {marquee && (
              <rect
                x={Math.min(marquee.x, marquee.x + marquee.w)}
                y={Math.min(marquee.y, marquee.y + marquee.h)}
                width={Math.abs(marquee.w)}
                height={Math.abs(marquee.h)}
                fill="rgba(59,130,246,0.12)"
                stroke="rgba(59,130,246,0.8)"
                strokeDasharray="6 4"
              />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function SelectionOutline({
  bounds,
  onResizeStart,
  onRotateStart,
}: {
  bounds: { x: number; y: number; width: number; height: number; rotation: number };
  onResizeStart: (dir: string, e: React.PointerEvent) => void;
  onRotateStart: (e: React.PointerEvent) => void;
}) {
  const handle = (dir: string, x: number, y: number) => (
    <rect
      x={x}
      y={y}
      width={10}
      height={10}
      fill="#38bdf8"
      stroke="#0f172a"
      strokeWidth={1}
      onPointerDown={(e) => {
        e.stopPropagation();
        onResizeStart(dir, e);
      }}
    />
  );

  return (
    <g transform={`translate(${bounds.x} ${bounds.y})`}>
      <rect
        x={0}
        y={0}
        width={bounds.width}
        height={bounds.height}
        fill="none"
        stroke="rgba(56,189,248,0.8)"
        strokeDasharray="6 4"
      />
      <circle
        cx={bounds.width / 2}
        cy={-24}
        r={6}
        fill="#fbbf24"
        stroke="#0f172a"
        strokeWidth={1}
        onPointerDown={(e) => {
          e.stopPropagation();
          onRotateStart(e);
        }}
      />
      {handle("nw", -5, -5)}
      {handle("ne", bounds.width - 5, -5)}
      {handle("sw", -5, bounds.height - 5)}
      {handle("se", bounds.width - 5, bounds.height - 5)}
      {handle("n", bounds.width / 2 - 5, -5)}
      {handle("s", bounds.width / 2 - 5, bounds.height - 5)}
      {handle("w", -5, bounds.height / 2 - 5)}
      {handle("e", bounds.width - 5, bounds.height / 2 - 5)}
    </g>
  );
}

function LayerNodeShape({
  node,
  selection,
  onSelect,
}: {
  node: LayerNode;
  selection: string[];
  onSelect: (id: string, additive?: boolean) => void;
}) {
  if (node.kind === "group") {
    return (
      <>
        {node.children.map((child) => (
          <LayerNodeShape key={child.id} node={child} selection={selection} onSelect={onSelect} />
        ))}
      </>
    );
  }
  return <ShapeElement shape={node.shape} selected={selection.includes(node.id)} onClick={onSelect} />;
}

function ShapeElement({ shape, selected, onClick }: { shape: Shape; selected?: boolean; onClick?: (id: string, additive?: boolean) => void }) {
  if (!shape.visible) return null;
  const stroke = shape.stroke.enabled ? shape.stroke.color : "transparent";
  const strokeWidth = shape.stroke.enabled ? shape.stroke.width : 0;
  const dash = shape.stroke.dashed ? "8 4" : undefined;
  const fill = shape.fill.enabled ? withOpacity(shape.fill.color, shape.fill.opacity) : "transparent";
  const filter =
    shape.shadow && shape.shadow.opacity > 0
      ? `drop-shadow(${shape.shadow.x}px ${shape.shadow.y}px ${shape.shadow.blur}px ${withOpacity(
          shape.shadow.color,
          shape.shadow.opacity
        )})`
      : undefined;
  const common = {
    transform: `translate(${shape.x} ${shape.y}) rotate(${shape.rotation}, ${shape.width / 2}, ${shape.height / 2})`,
    style: { cursor: "move", filter },
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      onClick?.(shape.id, e.shiftKey);
    },
  };

  if (shape.type === "rectangle") {
    return (
      <path
        d={roundedRect(shape.width, shape.height, shape.radius)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        opacity={shape.opacity}
        {...common}
      />
    );
  }
  if (shape.type === "ellipse") {
    return (
      <ellipse
        cx={shape.width / 2}
        cy={shape.height / 2}
        rx={shape.width / 2}
        ry={shape.height / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        opacity={shape.opacity}
        {...common}
      />
    );
  }
  if (shape.type === "line") {
    return (
      <line
        x1={0}
        y1={0}
        x2={shape.width}
        y2={shape.height}
        stroke={stroke}
        strokeWidth={Math.max(1, strokeWidth)}
        strokeDasharray={dash}
        opacity={shape.opacity}
        {...common}
      />
    );
  }
  const textShape = shape as TextShape;
  return (
    <g {...common}>
      <rect
        width={shape.width}
        height={shape.height}
        fill="transparent"
        stroke={selected ? "rgba(56,189,248,0.4)" : "transparent"}
      />
      <text
        x={textShape.align === "center" ? shape.width / 2 : textShape.align === "right" ? shape.width - 12 : 12}
        y={24}
        fill={textShape.textColor}
        style={{
          fontFamily: textShape.font,
          fontSize: textShape.fontSize,
          fontWeight: textShape.fontWeight,
          lineHeight: textShape.lineHeight,
          textAnchor: textShape.align === "center" ? "middle" : textShape.align === "right" ? "end" : "start",
        }}
      >
        {textShape.text}
      </text>
    </g>
  );
}

function hitTest(layers: LayerNode[], x: number, y: number): Shape | null {
  const shapes = collectShapes(layers);
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (!s.visible || s.locked) continue;
    if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) {
      return s;
    }
  }
  return null;
}

function hitWithin(layers: LayerNode[], rect: { x: number; y: number; w: number; h: number }): string[] {
  const shapes = collectShapes(layers);
  const ids: string[] = [];
  shapes.forEach((s) => {
    if (!s.visible || s.locked) return;
    if (
      s.x >= rect.x &&
      s.y >= rect.y &&
      s.x + s.width <= rect.x + rect.w &&
      s.y + s.height <= rect.y + rect.h
    ) {
      ids.push(s.id);
    }
  });
  return ids;
}

function marqueeRect(x: number, y: number, w: number, h: number) {
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}

function collectShapes(nodes: LayerNode[]): Shape[] {
  const result: Shape[] = [];
  const walk = (list: LayerNode[]) => {
    for (const node of list) {
      if (node.kind === "shape") result.push(node.shape);
      if (node.kind === "group") walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function roundedRect(w: number, h: number, r: Shape["radius"]) {
  const tl = r.tl || 0;
  const tr = r.tr || 0;
  const br = r.br || 0;
  const bl = r.bl || 0;
  return `
    M ${tl},0
    H ${w - tr}
    Q ${w},0 ${w},${tr}
    V ${h - br}
    Q ${w},${h} ${w - br},${h}
    H ${bl}
    Q 0,${h} 0,${h - bl}
    V ${tl}
    Q 0,0 ${tl},0
    Z
  `;
}

function withOpacity(hex: string, opacity: number) {
  if (hex.startsWith("rgba") || hex.startsWith("hsla")) return hex;
  return hex + Math.round(clamp(opacity, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function snapTo(v: number, step: number) {
  if (step <= 1) return v;
  return Math.round(v / step) * step;
}

function rotatePoint(x: number, y: number, ox: number, oy: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - ox;
  const dy = y - oy;
  return { x: ox + dx * cos - dy * sin, y: oy + dx * sin + dy * cos };
}
