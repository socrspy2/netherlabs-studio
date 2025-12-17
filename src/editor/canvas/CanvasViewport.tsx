import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ruler, Sparkle } from "lucide-react";
import { useEditor, createShapeForTool } from "../../state/editorStore";
import { LayerNode, PathShape, Shape } from "../../state/types";
import { PixiDocumentView } from "./PixiDocumentView";

type DragMode = "none" | "pan" | "marquee" | "creating" | "move" | "resize" | "rotate";

type Marquee = { x: number; y: number; w: number; h: number };

export function CanvasViewport() {
  const { doc, preview, checkpoint, applyShapePatches, setSelection, clearSelection, updateViewport, createShape } =
    useEditor();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [activeShape, setActiveShape] = useState<Shape | null>(null);
  const [penDraft, setPenDraft] = useState<{ points: PathShape["points"] } | null>(null);
  const [penPlacing, setPenPlacing] = useState<{ index: number; anchor: { x: number; y: number } } | null>(null);
  const [penExtend, setPenExtend] = useState<{ shapeId: string; at: "start" | "end" } | null>(null);
  const [pointDrag, setPointDrag] = useState<
    | { kind: "anchor"; shapeId: string; index: number; startWorld: { x: number; y: number }; startLocal: { x: number; y: number } }
    | { kind: "in" | "out"; shapeId: string; index: number; startWorld: { x: number; y: number } }
    | null
  >(null);
  const startPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragSnapshot = useRef<{
    shapes: Shape[];
    bounds: { x: number; y: number; width: number; height: number } | null;
  }>({ shapes: [], bounds: null });
  const resizeDir = useRef<string | null>(null);
  const rotateCenter = useRef<{ x: number; y: number } | null>(null);
  const dragStartClient = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rotateStartAngle = useRef<number>(0);
  const resizeStart = useRef<{
    bounds: { x: number; y: number; width: number; height: number };
    shapes: Shape[];
  } | null>(null);
  const spacePressed = useRef(false);

  const selectedShapes = useMemo(() => collectShapes(doc.layers).filter((s) => doc.selection.includes(s.id)), [doc.layers, doc.selection]);
  const selectedPath = useMemo(() => {
    if (selectedShapes.length !== 1) return null;
    const s = selectedShapes[0];
    if (s.type !== "path") return null;
    return s as PathShape;
  }, [selectedShapes]);

  const commitPenDraft = (pointsWorld: PathShape["points"], closed: boolean) => {
    if (pointsWorld.length < 2) return;
    const xs = pointsWorld.map((p) => p.x);
    const ys = pointsWorld.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const points = pointsWorld.map((p) => ({
      x: p.x - x,
      y: p.y - y,
      in: p.in ? { x: p.in.x - x, y: p.in.y - y } : null,
      out: p.out ? { x: p.out.x - x, y: p.out.y - y } : null,
    }));

    const shape = {
      ...(createShapeForTool("rectangle" as any, { x, y }) as any),
      id: crypto.randomUUID(),
      type: "path",
      name: "Path",
      x,
      y,
      width: Math.max(1, maxX - x),
      height: Math.max(1, maxY - y),
      points,
      closed,
    } as PathShape;

    createShape(shape);
    setPenDraft(null);
    setPenPlacing(null);
    setPenExtend(null);
  };

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
        spacePressed.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spacePressed.current = false;
      }
    };
    const handlePenKeys = (e: KeyboardEvent) => {
      if (doc.tool !== "pen") return;
      if (e.key === "Escape") {
        setPenDraft(null);
        setPenPlacing(null);
        setPenExtend(null);
      }
      if (e.key === "Enter" && penDraft?.points?.length && penDraft.points.length >= 2) {
        commitPenDraft(penDraft.points, false);
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keydown", handlePenKeys);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keydown", handlePenKeys);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [doc.tool, penDraft]);

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

  useEffect(() => {
    // Prevent browser text-selection (blue highlight) while dragging/resizing/panning.
    if (preview) return;
    if (dragMode === "none") return;
    const prevUserSelect = document.body.style.userSelect;
    const prevWebkitUserSelect = (document.body.style as any).webkitUserSelect;
    document.body.style.userSelect = "none";
    (document.body.style as any).webkitUserSelect = "none";
    return () => {
      document.body.style.userSelect = prevUserSelect;
      (document.body.style as any).webkitUserSelect = prevWebkitUserSelect;
    };
  }, [dragMode, preview]);

  const toWorld = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - doc.viewport.pan.x) / doc.viewport.zoom;
    const y = (clientY - rect.top - doc.viewport.pan.y) / doc.viewport.zoom;
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (preview) return;
    e.preventDefault();
    const world = toWorld(e.clientX, e.clientY);
    startPoint.current = world;
    dragStartClient.current = { x: e.clientX, y: e.clientY };

    const isPan = doc.tool === "hand" || e.button === 1 || spacePressed.current;
    if (isPan) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDragMode("pan");
      return;
    }

    if (doc.tool === "pen") {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setDragMode("none");
      setMarquee(null);

      // If a single open path is selected, allow endpoint extension (but never extend a closed path).
      if (selectedPath && !selectedPath.closed) {
        const start = { x: selectedPath.x + selectedPath.points[0].x, y: selectedPath.y + selectedPath.points[0].y };
        const endPt = selectedPath.points[selectedPath.points.length - 1];
        const end = { x: selectedPath.x + endPt.x, y: selectedPath.y + endPt.y };
        const hitRadius = 10 / doc.viewport.zoom;
        const dStart = Math.hypot(world.x - start.x, world.y - start.y);
        const dEnd = Math.hypot(world.x - end.x, world.y - end.y);

        if (!penExtend && (dStart <= hitRadius || dEnd <= hitRadius)) {
          setPenExtend({ shapeId: selectedPath.id, at: dStart <= dEnd ? "start" : "end" });
          return;
        }

        if (penExtend?.shapeId === selectedPath.id) {
          // close if clicking opposite endpoint
          if (penExtend.at === "end" && dStart <= hitRadius && selectedPath.points.length >= 3) {
            checkpoint();
            applyShapePatches([{ id: selectedPath.id, changes: (s) => (s.type === "path" ? { ...(s as PathShape), closed: true } : s) }], true);
            setPenExtend(null);
            return;
          }
          if (penExtend.at === "start" && dEnd <= hitRadius && selectedPath.points.length >= 3) {
            checkpoint();
            applyShapePatches([{ id: selectedPath.id, changes: (s) => (s.type === "path" ? { ...(s as PathShape), closed: true } : s) }], true);
            setPenExtend(null);
            return;
          }

          // append/prepend a new point (start placing handles)
          const local = { x: world.x - selectedPath.x, y: world.y - selectedPath.y };
          checkpoint();
          applyShapePatches(
            [
              {
                id: selectedPath.id,
                changes: (s) => {
                  if (s.type !== "path") return s;
                  const p = structuredClone(s as PathShape);
                  const pt = { x: local.x, y: local.y, in: null, out: null };
                  p.points = penExtend.at === "end" ? [...p.points, pt] : [pt, ...p.points];
                  p.width = Math.max(1, p.width);
                  p.height = Math.max(1, p.height);
                  return p;
                },
              },
            ],
            true
          );
          const idx = penExtend.at === "end" ? selectedPath.points.length : 0;
          setPenPlacing({ index: idx, anchor: world });
          setDragMode("creating");
          return;
        }
      }

      // new draft (do not extend closed shapes)
      if (selectedPath?.closed) {
        setPenExtend(null);
      }
      clearSelection();
      setPenExtend(null);

      setPenDraft((prev) => {
        const nextPoints = prev?.points ? [...prev.points] : [];
        if (nextPoints.length >= 3) {
          const first = nextPoints[0];
          const dist = Math.hypot(first.x - world.x, first.y - world.y);
          if (dist <= 10 / doc.viewport.zoom) {
            commitPenDraft(nextPoints, true);
            return null;
          }
        }
        nextPoints.push({ x: world.x, y: world.y, in: null, out: null });
        setPenPlacing({ index: nextPoints.length - 1, anchor: world });
        return { points: nextPoints };
      });
      setDragMode("creating");
      return;
    }

    const shapeUnder = hitTest(doc.layers, world.x, world.y);

    // creation tools
    if (["rectangle", "ellipse", "line", "text", "frame"].includes(doc.tool)) {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      const shape = createShapeForTool(doc.tool, world);
      shape.width = 20;
      shape.height = 20;
      setActiveShape(shape);
      setDragMode("creating");
      return;
    }

    if (doc.tool === "select") {
      if (shapeUnder) {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        checkpoint();

        const nextSelection = e.shiftKey
          ? Array.from(new Set([...doc.selection, shapeUnder.id]))
          : [shapeUnder.id];
        setSelection(nextSelection, false);

        const moveSetIds = e.shiftKey ? nextSelection : doc.selection.includes(shapeUnder.id) ? doc.selection : [shapeUnder.id];
        const allShapes = collectShapes(doc.layers);
        const moveSet = moveSetIds
          .map((id) => allShapes.find((s) => s.id === id))
          .filter(Boolean) as Shape[];

        dragSnapshot.current = { shapes: moveSet.length ? moveSet : [shapeUnder], bounds: selectionBounds };
        setDragMode("move");
        return;
      } else if (
        selectionBounds &&
        world.x >= selectionBounds.x &&
        world.x <= selectionBounds.x + selectionBounds.width &&
        world.y >= selectionBounds.y &&
        world.y <= selectionBounds.y + selectionBounds.height
      ) {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        checkpoint();
        dragSnapshot.current = { shapes: selectedShapes, bounds: selectionBounds };
        dragStartClient.current = { x: e.clientX, y: e.clientY };
        setDragMode("move");
        return;
      } else {
        clearSelection();
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setMarquee({ x: world.x, y: world.y, w: 0, h: 0 });
        setDragMode("marquee");
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (preview) return;
    if (!containerRef.current) return;
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

    if (doc.tool === "pen" && dragMode === "creating" && penPlacing) {
      const delta = { x: world.x - penPlacing.anchor.x, y: world.y - penPlacing.anchor.y };
      const magnitude = Math.hypot(delta.x, delta.y);
      const hasHandle = magnitude > 2 / doc.viewport.zoom;

      // update draft handles (world coords)
      if (penDraft) {
        setPenDraft((prev) => {
          if (!prev) return prev;
          const next = { points: prev.points.map((p) => ({ ...p })) };
          const p = next.points[penPlacing.index];
          if (!p) return prev;
          if (hasHandle) {
            p.out = { x: p.x + delta.x, y: p.y + delta.y };
            p.in = { x: p.x - delta.x, y: p.y - delta.y };
          } else {
            p.out = null;
            p.in = null;
          }
          return next;
        });
      } else if (selectedPath && penExtend?.shapeId === selectedPath.id) {
        // update last inserted point handles on existing path
        const index = penPlacing.index;
        applyShapePatches(
          [
            {
              id: selectedPath.id,
              changes: (shape) => {
                if (shape.type !== "path") return shape;
                const p = structuredClone(shape as PathShape);
                const pt = p.points[index];
                if (!pt) return shape;
                const localDelta = { x: delta.x, y: delta.y };
                if (hasHandle) {
                  pt.out = { x: pt.x + localDelta.x, y: pt.y + localDelta.y };
                  pt.in = { x: pt.x - localDelta.x, y: pt.y - localDelta.y };
                } else {
                  pt.out = null;
                  pt.in = null;
                }
                return p;
              },
            },
          ],
          false
        );
      }
      return;
    }

    if (dragMode === "move" && pointDrag && selectedPath) {
      if (pointDrag.kind === "anchor") {
        const deltaX = world.x - pointDrag.startWorld.x;
        const deltaY = world.y - pointDrag.startWorld.y;
        applyShapePatches(
          [
            {
              id: pointDrag.shapeId,
              changes: (shape) => {
                if (shape.type !== "path") return shape;
                const p = structuredClone(shape as PathShape);
                const pt = p.points[pointDrag.index];
                if (!pt) return shape;
                const nextAnchor = { x: pointDrag.startLocal.x + deltaX, y: pointDrag.startLocal.y + deltaY };
                const handleDelta = { x: nextAnchor.x - pt.x, y: nextAnchor.y - pt.y };
                pt.x = nextAnchor.x;
                pt.y = nextAnchor.y;
                if (pt.in) {
                  pt.in = { x: pt.in.x + handleDelta.x, y: pt.in.y + handleDelta.y };
                }
                if (pt.out) {
                  pt.out = { x: pt.out.x + handleDelta.x, y: pt.out.y + handleDelta.y };
                }
                return normalizePathBounds(p);
              },
            },
          ],
          false
        );
        return;
      }

      const local = { x: world.x - selectedPath.x, y: world.y - selectedPath.y };
      applyShapePatches(
        [
          {
            id: pointDrag.shapeId,
            changes: (shape) => {
              if (shape.type !== "path") return shape;
              const p = structuredClone(shape as PathShape);
              const pt = p.points[pointDrag.index];
              if (!pt) return shape;

              if (pointDrag.kind === "out") {
                pt.out = local;
                if (!e.altKey) {
                  pt.in = { x: pt.x * 2 - local.x, y: pt.y * 2 - local.y };
                }
              } else {
                pt.in = local;
                if (!e.altKey) {
                  pt.out = { x: pt.x * 2 - local.x, y: pt.y * 2 - local.y };
                }
              }
              return p;
            },
          },
        ],
        false
      );
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
      const start = resizeStart.current;
      if (!start) return;
      const dir = resizeDir.current;
      const nextBounds = computeResizeBounds(start.bounds, dir, dx, dy, {
        uniform: e.shiftKey,
        fromCenter: e.altKey,
      });
      dragSnapshot.current.bounds = nextBounds;

      applyShapePatches(
        start.shapes.map((s) => {
          const rx = (s.x - start.bounds.x) / Math.max(1, start.bounds.width);
          const ry = (s.y - start.bounds.y) / Math.max(1, start.bounds.height);
          const rw = s.width / Math.max(1, start.bounds.width);
          const rh = s.height / Math.max(1, start.bounds.height);
          const newX = nextBounds.x + rx * nextBounds.width;
          const newY = nextBounds.y + ry * nextBounds.height;
          const newW = Math.max(4, nextBounds.width * rw);
          const newH = Math.max(4, nextBounds.height * rh);

          if (s.type === "path") {
            const startPath = s as PathShape;
            return {
              id: s.id,
              changes: (shape) => {
                if (shape.type !== "path") return shape;
                const sx = newW / Math.max(1, startPath.width);
                const sy = newH / Math.max(1, startPath.height);
                const points = startPath.points.map((pt) => ({
                  x: pt.x * sx,
                  y: pt.y * sy,
                  in: pt.in ? { x: pt.in.x * sx, y: pt.in.y * sy } : null,
                  out: pt.out ? { x: pt.out.x * sx, y: pt.out.y * sy } : null,
                }));
                return { ...(shape as PathShape), x: newX, y: newY, width: newW, height: newH, points };
              },
            };
          }

          return {
            id: s.id,
            changes: { x: newX, y: newY, width: newW, height: newH },
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
    if (preview) return;
    if (dragMode === "creating" && activeShape) {
      createShape(activeShape);
      setActiveShape(null);
    }
    if (doc.tool === "pen" && dragMode === "creating") {
      setPenPlacing(null);
      setDragMode("none");
      return;
    }
    setDragMode("none");
    setMarquee(null);
    resizeStart.current = null;
    resizeDir.current = null;
    rotateCenter.current = null;
    setPointDrag(null);
    setPenPlacing(null);
  };

  const zoomLabel = `${Math.round(doc.viewport.zoom * 100)}%`;
  const paperBackground = getCanvasPaperStyle(doc.canvasBackground);

  return (
    <div style={{ position: "relative", minHeight: 0, height: "100%", background: "#0b1224", display: "flex", flexDirection: "column" }}>
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
          background: "#0b1224",
          borderRadius: 16,
          margin: 12,
          border: "1px solid rgba(255,255,255,0.05)",
          minHeight: 0,
          flex: 1,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (!file.type.startsWith("image/")) return;
          const world = toWorld(e.clientX, e.clientY);
          const src = await readFileAsDataURL(file);
          const dims = await probeImageSize(src);
          const maxW = 520;
          const w = Math.min(maxW, dims.width || 320);
          const h = dims.width ? (dims.height / dims.width) * w : 240;
          const base = createShapeForTool("rectangle" as any, { x: world.x, y: world.y }) as any;
          const imageShape = {
            ...base,
            id: crypto.randomUUID(),
            type: "image",
            name: file.name,
            x: world.x,
            y: world.y,
            width: Math.max(20, w),
            height: Math.max(20, h),
            src,
          };
          createShape(imageShape);
        }}
      >
        <div style={{ position: "absolute", inset: 0, ...paperBackground, pointerEvents: "none" }} />
        <PixiDocumentView />

        {/* non-interactive overlay (grid + previews) */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `translate(${doc.viewport.pan.x}px, ${doc.viewport.pan.y}px) scale(${doc.viewport.zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg width={1800} height={1200} style={{ overflow: "visible" }}>
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect width="40" height="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                  <rect width="10" height="10" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="1800" height="1200" fill="url(#grid)" />

              {activeShape && <PreviewShapeOutline shape={activeShape} />}
              {doc.tool === "pen" && penDraft?.points?.length ? (
                <>
                  <path
                    d={pathFromDraft(penDraft.points)}
                    fill="none"
                    stroke="rgba(56,189,248,0.85)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {penDraft.points.map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r={4} fill="#38bdf8" stroke="#0f172a" strokeWidth={1} />
                  ))}
                </>
              ) : null}
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

        {/* interactive overlay (selection + handles) */}
        {!preview ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `translate(${doc.viewport.pan.x}px, ${doc.viewport.pan.y}px) scale(${doc.viewport.zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg width={1800} height={1200} style={{ overflow: "visible", pointerEvents: "none" }}>
                {selectionBounds && (
                  <SelectionOutline
                    bounds={selectionBounds}
                    onMoveStart={(e) => {
                      if (!containerRef.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      containerRef.current.setPointerCapture(e.pointerId);
                      checkpoint();
                      dragSnapshot.current = { shapes: selectedShapes, bounds: selectionBounds };
                      dragStartClient.current = { x: e.clientX, y: e.clientY };
                      setDragMode("move");
                    }}
                    onResizeStart={(dir, e) => {
                      checkpoint();
                      if (!containerRef.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      containerRef.current.setPointerCapture(e.pointerId);
                      const world = toWorld(e.clientX, e.clientY);
                      startPoint.current = world;
                      resizeDir.current = dir;
                      dragSnapshot.current = { shapes: selectedShapes, bounds: selectionBounds };
                      resizeStart.current = {
                        bounds: {
                          x: selectionBounds.x,
                          y: selectionBounds.y,
                          width: selectionBounds.width,
                          height: selectionBounds.height,
                        },
                        shapes: selectedShapes.map((s) => structuredClone(s)),
                      };
                      setDragMode("resize");
                    }}
                    onRotateStart={(e) => {
                      checkpoint();
                      if (!containerRef.current) return;
                      e.preventDefault();
                      e.stopPropagation();
                      containerRef.current.setPointerCapture(e.pointerId);
                      const world = toWorld(e.clientX, e.clientY);
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

                {selectedPath && doc.tool === "select" ? (
                  <>
                    {selectedPath.points.map((pt, idx) => (
                      <g key={idx} style={{ pointerEvents: "none" }}>
                        {pt.in ? (
                          <>
                            <line
                              x1={selectedPath.x + pt.x}
                              y1={selectedPath.y + pt.y}
                              x2={selectedPath.x + pt.in.x}
                              y2={selectedPath.y + pt.in.y}
                              stroke="rgba(148,163,184,0.65)"
                              strokeWidth={1.5}
                            />
                            <circle
                              cx={selectedPath.x + pt.in.x}
                              cy={selectedPath.y + pt.in.y}
                              r={4}
                              fill="#94a3b8"
                              stroke="#0f172a"
                              strokeWidth={2}
                              style={{ pointerEvents: "all" }}
                              onPointerDown={(e) => {
                                if (!containerRef.current) return;
                                e.preventDefault();
                                e.stopPropagation();
                                containerRef.current.setPointerCapture(e.pointerId);
                                checkpoint();
                                setPointDrag({
                                  kind: "in",
                                  shapeId: selectedPath.id,
                                  index: idx,
                                  startWorld: toWorld(e.clientX, e.clientY),
                                });
                                setDragMode("move");
                              }}
                            />
                          </>
                        ) : null}
                        {pt.out ? (
                          <>
                            <line
                              x1={selectedPath.x + pt.x}
                              y1={selectedPath.y + pt.y}
                              x2={selectedPath.x + pt.out.x}
                              y2={selectedPath.y + pt.out.y}
                              stroke="rgba(148,163,184,0.65)"
                              strokeWidth={1.5}
                            />
                            <circle
                              cx={selectedPath.x + pt.out.x}
                              cy={selectedPath.y + pt.out.y}
                              r={4}
                              fill="#94a3b8"
                              stroke="#0f172a"
                              strokeWidth={2}
                              style={{ pointerEvents: "all" }}
                              onPointerDown={(e) => {
                                if (!containerRef.current) return;
                                e.preventDefault();
                                e.stopPropagation();
                                containerRef.current.setPointerCapture(e.pointerId);
                                checkpoint();
                                setPointDrag({
                                  kind: "out",
                                  shapeId: selectedPath.id,
                                  index: idx,
                                  startWorld: toWorld(e.clientX, e.clientY),
                                });
                                setDragMode("move");
                              }}
                            />
                          </>
                        ) : null}
                        <circle
                          cx={selectedPath.x + pt.x}
                          cy={selectedPath.y + pt.y}
                          r={5}
                          fill="#e2e8f0"
                          stroke="#0f172a"
                          strokeWidth={2}
                          style={{ pointerEvents: "all" }}
                          onPointerDown={(e) => {
                            if (!containerRef.current) return;
                            e.preventDefault();
                            e.stopPropagation();
                            containerRef.current.setPointerCapture(e.pointerId);
                            checkpoint();
                            setPointDrag({
                              kind: "anchor",
                              shapeId: selectedPath.id,
                              index: idx,
                              startWorld: toWorld(e.clientX, e.clientY),
                              startLocal: { x: pt.x, y: pt.y },
                            });
                            setDragMode("move");
                          }}
                        />
                      </g>
                    ))}
                  </>
                ) : null}
              </svg>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PreviewShapeOutline({ shape }: { shape: Shape }) {
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      fill="none"
      stroke="rgba(56,189,248,0.55)"
      strokeDasharray="6 4"
    />
  );
}

function SelectionOutline({
  bounds,
  onMoveStart,
  onResizeStart,
  onRotateStart,
}: {
  bounds: { x: number; y: number; width: number; height: number; rotation: number };
  onMoveStart: (e: React.PointerEvent) => void;
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
      style={{ pointerEvents: "all" }}
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
        style={{ pointerEvents: "all" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onMoveStart(e);
        }}
      />
      <circle
        cx={bounds.width / 2}
        cy={-24}
        r={6}
        fill="#fbbf24"
        stroke="#0f172a"
        strokeWidth={1}
        style={{ pointerEvents: "all" }}
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

function normalizePathBounds(path: PathShape): PathShape {
  if (!path.points.length) return path;
  const xs = path.points.map((p) => p.x);
  const ys = path.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const points = path.points.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
    in: p.in ? { x: p.in.x - minX, y: p.in.y - minY } : null,
    out: p.out ? { x: p.out.x - minX, y: p.out.y - minY } : null,
  }));
  return {
    ...path,
    x: path.x + minX,
    y: path.y + minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    points,
  };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function probeImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

function getCanvasPaperStyle(bg: any): React.CSSProperties {
  if (!bg) return { background: "#0f172a" };
  if (bg.kind === "preset") {
    if (bg.value === "white") return { background: "#ffffff" };
    if (bg.value === "black") return { background: "#0b0f1a" };
    return { background: "#0b1224" };
  }
  if (bg.kind === "custom") {
    return { background: bg.color || "#0b1224" };
  }
  // checkerboard
  return {
    backgroundColor: "#111827",
    backgroundImage:
      "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%)," +
      "linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%)," +
      "linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%)," +
      "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)",
    backgroundSize: "24px 24px",
    backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px",
  };
}

function pathFromDraft(points: PathShape["points"]) {
  if (!points.length) return "";
  const parts: string[] = [];
  parts.push(`M ${points[0].x} ${points[0].y}`);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const c1 = a.out ?? a;
    const c2 = b.in ?? b;
    const isCurve =
      (a.out && (a.out.x !== a.x || a.out.y !== a.y)) || (b.in && (b.in.x !== b.x || b.in.y !== b.y));
    if (isCurve) {
      parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`);
    } else {
      parts.push(`L ${b.x} ${b.y}`);
    }
  }
  return parts.join(" ");
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

function computeResizeBounds(
  start: { x: number; y: number; width: number; height: number },
  dir: string,
  dx: number,
  dy: number,
  opts: { uniform: boolean; fromCenter: boolean }
) {
  const left0 = start.x;
  const right0 = start.x + start.width;
  const top0 = start.y;
  const bottom0 = start.y + start.height;
  const aspect = start.width / Math.max(1, start.height);

  let left = left0;
  let right = right0;
  let top = top0;
  let bottom = bottom0;

  const applyX = (delta: number, which: "left" | "right") => {
    if (opts.fromCenter) {
      right = right0 + delta;
      left = left0 - delta;
      return;
    }
    if (which === "right") right = right0 + delta;
    if (which === "left") left = left0 + delta;
  };
  const applyY = (delta: number, which: "top" | "bottom") => {
    if (opts.fromCenter) {
      bottom = bottom0 + delta;
      top = top0 - delta;
      return;
    }
    if (which === "bottom") bottom = bottom0 + delta;
    if (which === "top") top = top0 + delta;
  };

  if (dir.includes("e")) applyX(dx, "right");
  if (dir.includes("w")) applyX(dx, "left");
  if (dir.includes("s")) applyY(dy, "bottom");
  if (dir.includes("n")) applyY(dy, "top");

  let width = Math.max(4, right - left);
  let height = Math.max(4, bottom - top);

  if (opts.uniform) {
    const widthBasedHeight = width / Math.max(0.0001, aspect);
    const heightBasedWidth = height * aspect;
    const useWidth = Math.abs(width - start.width) >= Math.abs(height - start.height);
    if (useWidth) {
      height = Math.max(4, widthBasedHeight);
    } else {
      width = Math.max(4, heightBasedWidth);
    }

    if (opts.fromCenter) {
      const cx = start.x + start.width / 2;
      const cy = start.y + start.height / 2;
      left = cx - width / 2;
      right = cx + width / 2;
      top = cy - height / 2;
      bottom = cy + height / 2;
    } else {
      // anchor depends on handle direction
      if (dir.includes("w")) {
        right = right0;
        left = right - width;
      } else if (dir.includes("e")) {
        left = left0;
        right = left + width;
      } else {
        // no horizontal handle: center X
        const cx = start.x + start.width / 2;
        left = cx - width / 2;
        right = cx + width / 2;
      }

      if (dir.includes("n")) {
        bottom = bottom0;
        top = bottom - height;
      } else if (dir.includes("s")) {
        top = top0;
        bottom = top + height;
      } else {
        const cy = start.y + start.height / 2;
        top = cy - height / 2;
        bottom = cy + height / 2;
      }
    }
  }

  return { x: left, y: top, width: Math.max(4, right - left), height: Math.max(4, bottom - top) };
}
