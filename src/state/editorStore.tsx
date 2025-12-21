import React, { useCallback, useMemo, useState } from "react";
import {
  flatten,
  groupWithinSameParent,
  maskGroupWithinSameParent,
  moveWithinParent,
  removeNodes,
  reorder,
  ungroup,
  updateShape,
} from "./layers";
import {
  EditorDocument,
  LayerNode,
  Shape,
  ShapeNode,
  ToolId,
  ViewportState,
  GridSettings,
} from "./types";

export const DEFAULT_GRID: GridSettings = { size: 10, color: "#94a3b8", visible: true, magnetic: true };

type History = {
  past: EditorDocument[];
  future: EditorDocument[];
};

type EditorContextValue = {
  doc: EditorDocument;
  history: History;
  checkpoint: () => void;
  setCanvasBackground: (bg: EditorDocument["canvasBackground"]) => void;
  setCanvasSize: (size: EditorDocument["canvasSize"]) => void;
  setGrid: (grid: Partial<GridSettings>) => void;
  preview: boolean;
  setPreview: (v: boolean) => void;
  setTool: (tool: ToolId) => void;
  setSelection: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  updateViewport: (vp: Partial<ViewportState>) => void;
  createShape: (shape: Shape) => void;
  updateShapeProps: (id: string, changes: Partial<Shape> | ((shape: Shape) => Shape)) => void;
  applyShapePatches: (patches: { id: string; changes: Partial<Shape> | ((shape: Shape) => Shape) }[], pushHistory?: boolean) => void;
  moveSelection: (dx: number, dy: number, pushHistory?: boolean) => void;
  resizeSelection: (rect: { x: number; y: number; width: number; height: number }, pushHistory?: boolean) => void;
  rotateSelection: (rotation: number, pushHistory?: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  bring: (dir: "front" | "back" | "up" | "down") => void;
  moveLayer: (draggedId: string, targetId: string, position: "before" | "after") => void;
  makeMaskFromSelection: () => void;
  toggleMask: (groupId: string) => void;
  toggleVisible: (id: string) => void;
  toggleLocked: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  undo: () => void;
  redo: () => void;
};

const EditorContext = React.createContext<EditorContextValue | null>(null);

function baseShape(type: Shape["type"], name: string, x: number, y: number): Shape {
  const fillDefault = { enabled: true, kind: "solid", color: "#4f46e5", opacity: 1 } as Shape["fill"];
  const strokeDefault = {
    enabled: true,
    kind: "solid",
    color: "#0f172a",
    width: 2,
    align: "center",
    dashed: false,
    opacity: 1,
  } as Shape["stroke"];
  const glowDefault = {
    enabled: false,
    mode: "outer" as const,
    color: "#4f46e5",
    opacity: 0.35,
    blur: 16,
    spread: 4,
    offset: { x: 0, y: 0 },
  };

  const common = {
    id: crypto.randomUUID(),
    name,
    type,
    x,
    y,
    width: 160,
    height: 120,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: fillDefault,
    stroke: strokeDefault,
    radius: { tl: 8, tr: 8, br: 8, bl: 8 },
    shadow: { enabled: true, x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.16 },
    glow: glowDefault,
    effects: { blur: 0, backgroundBlur: 0 },
    blendMode: "normal",
  };

  if (type === "text") {
    return {
      ...common,
      type: "text",
      width: 240,
      height: 96,
      text: "New text",
      font: "Inter, system-ui, -apple-system, sans-serif",
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.4,
      align: "left",
      textColor: "#111827",
      textFill: { enabled: true, kind: "solid", color: "#111827", opacity: 1 },
    } as Shape;
  }

  if (type === "line") {
    return { ...common, fill: { ...common.fill, enabled: false }, height: 0 } as Shape;
  }

  if (type === "path") {
    return { ...common, type: "path", points: [], closed: false } as any;
  }

  if (type === "image") {
    return { ...common, type: "image", src: "" } as any;
  }

  return common as Shape;
}

function initialDoc(): EditorDocument {
  const rect = baseShape("rectangle", "Hero Card", 200, 180);
  rect.width = 320;
  rect.height = 220;
  rect.fill = { enabled: true, kind: "solid", color: "#c7d2fe", opacity: 1 };
  rect.radius = { tl: 16, tr: 16, br: 16, bl: 16 };

  const ellipse = baseShape("ellipse", "Accent", 620, 220);
  ellipse.width = 160;
  ellipse.height = 160;
  ellipse.fill = { enabled: true, kind: "solid", color: "#fbbf24", opacity: 0.9 };

  const text = baseShape("text", "Title", 240, 220) as any;
  text.text = "Design Surface";
  text.fontSize = 28;
  text.fontWeight = 700;
  text.lineHeight = 1.35;
  text.textColor = "#111827";
  text.textFill = { enabled: true, kind: "solid", color: "#111827", opacity: 1 };
  text.width = 260;
  text.height = 140;

  return {
    layers: [
      { id: rect.id, kind: "shape", shape: rect },
      { id: ellipse.id, kind: "shape", shape: ellipse },
      { id: text.id, kind: "shape", shape: text },
    ],
    selection: [rect.id],
    tool: "select",
    viewport: { pan: { x: 120, y: 60 }, zoom: 1 },
    canvasBackground: { kind: "preset", value: "white" },
    canvasSize: { width: 1440, height: 900 },
    grid: DEFAULT_GRID,
  };
}

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<EditorDocument>(() => initialDoc());
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const [preview, setPreview] = useState(false);

  const checkpoint = useCallback(() => {
    setHistory((h) => ({
      past: [...h.past.slice(-40), doc],
      future: [],
    }));
  }, [doc]);

  const setCanvasBackground = useCallback((bg: EditorDocument["canvasBackground"]) => {
    setDoc((d) => ({ ...d, canvasBackground: bg }));
  }, []);

  const setCanvasSize = useCallback((size: EditorDocument["canvasSize"]) => {
    setDoc((d) => ({
      ...d,
      canvasSize: {
        width: Math.max(1, Math.round(size.width)),
        height: Math.max(1, Math.round(size.height)),
      },
    }));
  }, []);

  const setGrid = useCallback((grid: Partial<GridSettings>) => {
    setDoc((d) => ({
      ...d,
      grid: {
        ...(d.grid ?? DEFAULT_GRID),
        ...grid,
        size: Math.max(1, Math.round(grid.size ?? d.grid?.size ?? DEFAULT_GRID.size)),
      } as GridSettings,
    }));
  }, []);

  const commit = useCallback(
    (next: EditorDocument, pushHistory = true) => {
      setDoc(next);
      if (pushHistory) {
        setHistory((h) => ({
          past: [...h.past.slice(-40), doc],
          future: [],
        }));
      }
    },
    [doc]
  );

  const setTool = useCallback((tool: ToolId) => {
    setDoc((d) => ({ ...d, tool }));
  }, []);

  const setSelection = useCallback((ids: string[], additive?: boolean) => {
    setDoc((d) => {
      const next = additive ? Array.from(new Set([...d.selection, ...ids])) : ids;
      return { ...d, selection: next };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setDoc((d) => ({ ...d, selection: [] }));
  }, []);

  const updateViewport = useCallback((vp: Partial<ViewportState>) => {
    setDoc((d) => ({ ...d, viewport: { ...d.viewport, ...vp } }));
  }, []);

  const createShape = useCallback(
    (shape: Shape) => {
      const nextDoc = structuredClone(doc);
      nextDoc.layers.push({ id: shape.id, kind: "shape", shape });
      nextDoc.selection = [shape.id];
      commit(nextDoc);
    },
    [commit, doc]
  );

  const applyShapePatches = useCallback(
    (patches: { id: string; changes: Partial<Shape> | ((shape: Shape) => Shape) }[], pushHistory = false) => {
      if (!patches.length) return;
      const next = structuredClone(doc);
      for (const patch of patches) {
        updateShape(next.layers, patch.id, (shape) =>
          typeof patch.changes === "function" ? (patch.changes as any)(shape) : { ...shape, ...patch.changes }
        );
      }
      commit(next, pushHistory);
    },
    [commit, doc]
  );

  const updateShapeProps = useCallback(
    (id: string, changes: Partial<Shape> | ((shape: Shape) => Shape)) => {
      const next = structuredClone(doc);
      updateShape(next.layers, id, (shape) => (typeof changes === "function" ? (changes as any)(shape) : { ...shape, ...changes }));
      commit(next);
    },
    [commit, doc]
  );

  const moveSelection = useCallback(
    (dx: number, dy: number, pushHistory = false) => {
      if (!doc.selection.length) return;
      const next = structuredClone(doc);
      for (const id of doc.selection) {
        updateShape(next.layers, id, (shape) => ({ ...shape, x: shape.x + dx, y: shape.y + dy }));
      }
      commit(next, pushHistory);
    },
    [commit, doc]
  );

  const resizeSelection = useCallback(
    (rect: { x: number; y: number; width: number; height: number }, pushHistory = false) => {
      if (!doc.selection.length) return;
      const next = structuredClone(doc);
      for (const id of doc.selection) {
        updateShape(next.layers, id, (shape) => ({
          ...shape,
          x: rect.x,
          y: rect.y,
          width: Math.max(4, rect.width),
          height: Math.max(4, rect.height),
        }));
      }
      commit(next, pushHistory);
    },
    [commit, doc]
  );

  const rotateSelection = useCallback(
    (rotation: number, pushHistory = false) => {
      if (!doc.selection.length) return;
      const next = structuredClone(doc);
      for (const id of doc.selection) {
        updateShape(next.layers, id, (shape) => ({ ...shape, rotation }));
      }
      commit(next, pushHistory);
    },
    [commit, doc]
  );

  const deleteSelection = useCallback(() => {
    if (!doc.selection.length) return;
    const ids = new Set(doc.selection);
    const next = structuredClone(doc);
    next.layers = removeNodes(next.layers, ids);
    next.selection = [];
    commit(next);
  }, [commit, doc]);

  const duplicateSelection = useCallback(() => {
    if (!doc.selection.length) return;
    const next = structuredClone(doc);
    const all = flatten(next.layers);
    const created: string[] = [];
    for (const id of doc.selection) {
      const found = all.find((n) => n.id === id);
      if (found && found.kind === "shape") {
        const copy: ShapeNode = {
          id: crypto.randomUUID(),
          kind: "shape",
          shape: { ...found.shape, id: crypto.randomUUID(), name: `${found.shape.name} Copy`, x: found.shape.x + 16, y: found.shape.y + 16 },
        };
        next.layers.push(copy);
        created.push(copy.id);
      }
    }
    next.selection = created;
    commit(next);
  }, [commit, doc]);

  const bring = useCallback(
    (dir: "front" | "back" | "up" | "down") => {
      if (!doc.selection.length) return;
      const next = structuredClone(doc);
      next.layers = reorder(next.layers, doc.selection[0], dir);
      commit(next);
    },
    [commit, doc]
  );

  const moveLayer = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      const next = structuredClone(doc);
      next.layers = moveWithinParent(next.layers, draggedId, targetId, position);
      commit(next);
    },
    [commit, doc]
  );

  const makeMaskFromSelection = useCallback(() => {
    if (doc.selection.length < 2) return;
    const next = structuredClone(doc);
    next.layers = maskGroupWithinSameParent(next.layers, doc.selection, "Mask");
    const grouped = flatten(next.layers).find((n) => n.kind === "group" && n.mask?.enabled);
    next.selection = grouped ? [grouped.id] : [];
    commit(next);
  }, [commit, doc]);

  const toggleMask = useCallback(
    (groupId: string) => {
      const next = structuredClone(doc);
      const flat = flatten(next.layers);
      const node = flat.find((n) => n.kind === "group" && n.id === groupId) as any;
      if (!node?.mask) return;
      node.mask.enabled = !node.mask.enabled;
      commit(next);
    },
    [commit, doc]
  );

  const toggleVisible = useCallback(
    (id: string) => {
      const next = structuredClone(doc);
      const flat = flatten(next.layers);
      const node = flat.find((n) => n.id === id);
      if (!node) return;
      if (node.kind === "shape") node.shape.visible = !node.shape.visible;
      if (node.kind === "group") node.visible = !node.visible;
      commit(next);
    },
    [commit, doc]
  );

  const toggleLocked = useCallback(
    (id: string) => {
      const next = structuredClone(doc);
      const flat = flatten(next.layers);
      const node = flat.find((n) => n.id === id);
      if (!node) return;
      if (node.kind === "shape") node.shape.locked = !node.shape.locked;
      if (node.kind === "group") node.locked = !node.locked;
      commit(next);
    },
    [commit, doc]
  );

  const renameLayer = useCallback(
    (id: string, name: string) => {
      const next = structuredClone(doc);
      const flat = flatten(next.layers);
      const node = flat.find((n) => n.id === id);
      if (!node) return;
      if (node.kind === "shape") node.shape.name = name;
      if (node.kind === "group") node.name = name;
      commit(next);
    },
    [commit, doc]
  );

  const groupSelected = useCallback(() => {
    if (doc.selection.length < 1) return;
    const next = structuredClone(doc);
    next.layers = groupWithinSameParent(next.layers, doc.selection, "Group");
    const selectedSet = new Set(doc.selection);
    const grouped = flatten(next.layers).find((n) => {
      if (n.kind !== "group") return false;
      const childIds = new Set(n.children.map((c) => c.id));
      if (childIds.size !== selectedSet.size) return false;
      for (const id of selectedSet) if (!childIds.has(id)) return false;
      return true;
    });
    next.selection = grouped ? [grouped.id] : [];
    commit(next);
  }, [commit, doc]);

  const ungroupSelected = useCallback(() => {
    if (!doc.selection.length) return;
    const next = structuredClone(doc);
    next.layers = ungroup(next.layers, doc.selection[0]);
    next.selection = [];
    commit(next);
  }, [commit, doc]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      setDoc(prev);
      return { past: h.past.slice(0, -1), future: [doc, ...h.future] };
    });
  }, [doc]);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const next = h.future[0];
      setDoc(next);
      return { past: [...h.past, doc], future: h.future.slice(1) };
    });
  }, [doc]);

  const value = useMemo<EditorContextValue>(
    () => ({
      doc,
      history,
      checkpoint,
      setCanvasBackground,
      setCanvasSize,
      setGrid,
      preview,
      setPreview,
      setTool,
      setSelection,
      clearSelection,
      updateViewport,
      createShape,
      updateShapeProps,
      applyShapePatches,
      moveSelection,
      resizeSelection,
      rotateSelection,
      deleteSelection,
      duplicateSelection,
      bring,
      moveLayer,
      makeMaskFromSelection,
      toggleMask,
      toggleVisible,
      toggleLocked,
      renameLayer,
      groupSelected,
      ungroupSelected,
      undo,
      redo,
    }),
    [
      doc,
      history,
      checkpoint,
      setCanvasBackground,
      setCanvasSize,
      setGrid,
      preview,
      setPreview,
      setTool,
      setSelection,
      clearSelection,
      updateViewport,
      createShape,
      updateShapeProps,
      applyShapePatches,
      moveSelection,
      resizeSelection,
      rotateSelection,
      deleteSelection,
      duplicateSelection,
      bring,
      moveLayer,
      makeMaskFromSelection,
      toggleMask,
      toggleVisible,
      toggleLocked,
      renameLayer,
      groupSelected,
      ungroupSelected,
      undo,
      redo,
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = React.useContext(EditorContext);
  if (!ctx) throw new Error("EditorContext missing");
  return ctx;
}

export function createShapeForTool(tool: ToolId, at: { x: number; y: number }): Shape {
  switch (tool) {
    case "rectangle":
      return createRectPath(at.x, at.y, 160, 120);
    case "frame":
      return baseShape("rectangle", "Rectangle", at.x, at.y);
    case "ellipse":
      return createEllipsePath(at.x, at.y, 160, 120);
    case "triangle":
      return createTrianglePath(at.x, at.y, 180, 150);
    case "trapezoid":
      return createTrapezoidPath(at.x, at.y, 200, 140);
    case "star":
      return createStarPath(at.x, at.y, 180, 180, 5, 0.45);
    case "polygon":
      return createPolygonPath(at.x, at.y, 200, 200, 6, 12);
    case "wave":
      return createWavePath(at.x, at.y, 220, 140, 3);
    case "arrow":
      return createArrowPath(at.x, at.y, 220, 140);
    case "line":
      return baseShape("line", "Line", at.x, at.y);
    case "text":
      return baseShape("text", "Text", at.x, at.y);
    default:
      return baseShape("rectangle", "Rectangle", at.x, at.y);
  }
}

function createRectPath(x: number, y: number, width: number, height: number): Shape {
  const shape = baseShape("path", "Rectangle", x, y) as any as Shape & { points: any[]; closed: boolean };
  shape.width = width;
  shape.height = height;
  shape.points = [
    { x: 0, y: 0, in: null, out: null, pointType: "corner" },
    { x: width, y: 0, in: null, out: null, pointType: "corner" },
    { x: width, y: height, in: null, out: null, pointType: "corner" },
    { x: 0, y: height, in: null, out: null, pointType: "corner" },
  ];
  shape.closed = true;
  return shape;
}

function createEllipsePath(x: number, y: number, width: number, height: number): Shape {
  const shape = baseShape("path", "Ellipse", x, y) as any as Shape & { points: any[]; closed: boolean };
  shape.width = width;
  shape.height = height;
  const rx = width / 2;
  const ry = height / 2;
  const cx = rx;
  const cy = ry;
  const k = 0.5522847498;
  shape.points = [
    {
      x: cx + rx,
      y: cy,
      in: { x: cx + rx, y: cy - ry * k },
      out: { x: cx + rx, y: cy + ry * k },
      pointType: "smooth",
    },
    {
      x: cx,
      y: cy + ry,
      in: { x: cx + rx * k, y: cy + ry },
      out: { x: cx - rx * k, y: cy + ry },
      pointType: "smooth",
    },
    {
      x: cx - rx,
      y: cy,
      in: { x: cx - rx, y: cy + ry * k },
      out: { x: cx - rx, y: cy - ry * k },
      pointType: "smooth",
    },
    {
      x: cx,
      y: cy - ry,
      in: { x: cx - rx * k, y: cy - ry },
      out: { x: cx + rx * k, y: cy - ry },
      pointType: "smooth",
    },
  ];
  shape.closed = true;
  return shape;
}

function createTrianglePath(x: number, y: number, width: number, height: number): Shape {
  const shape = baseShape("path", "Triangle", x, y) as any as Shape & { points: any[]; closed: boolean };
  shape.width = width;
  shape.height = height;
  shape.points = [
    { x: width / 2, y: 0, in: null, out: null, pointType: "corner" },
    { x: width, y: height, in: null, out: null, pointType: "corner" },
    { x: 0, y: height, in: null, out: null, pointType: "corner" },
  ];
  shape.closed = true;
  return shape;
}

function createTrapezoidPath(x: number, y: number, width: number, height: number): Shape {
  const shape = baseShape("path", "Trapezoid", x, y) as any as Shape & { points: any[]; closed: boolean };
  shape.width = width;
  shape.height = height;
  const inset = width * 0.2;
  shape.points = [
    { x: inset, y: 0, in: null, out: null, pointType: "corner" },
    { x: width - inset, y: 0, in: null, out: null, pointType: "corner" },
    { x: width, y: height, in: null, out: null, pointType: "corner" },
    { x: 0, y: height, in: null, out: null, pointType: "corner" },
  ];
  shape.closed = true;
  return shape;
}

function createStarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  pointsCount: number,
  innerRatio: number
): Shape {
  const shape = baseShape("path", "Star", x, y) as any as Shape & { points: any[]; closed: boolean };
  shape.width = width;
  shape.height = height;
  const cx = width / 2;
  const cy = height / 2;
  const outerR = Math.min(width, height) / 2;
  const innerR = outerR * innerRatio;
  const pts: any[] = [];
  for (let i = 0; i < pointsCount * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / pointsCount - Math.PI / 2;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    pts.push({ x: px, y: py, in: null, out: null, pointType: "corner" });
  }
  shape.points = pts;
  shape.closed = true;
  return shape;
}

function createPolygonPath(
  x: number,
  y: number,
  width: number,
  height: number,
  sides: number,
  cornerRadius: number
): Shape {
  const shape = baseShape("path", "Polygon", x, y) as any as Shape & { points: any[]; closed: boolean };
  const n = Math.max(3, Math.floor(sides));
  const w = width;
  const h = height;
  shape.width = w;
  shape.height = h;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const radius = Math.min(cornerRadius, r * 0.6);
  const pts: any[] = [];

  const getPoint = (angle: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });

  for (let i = 0; i < n; i++) {
    const a0 = ((i - 1 + n) % n) * ((Math.PI * 2) / n) - Math.PI / 2;
    const a1 = i * ((Math.PI * 2) / n) - Math.PI / 2;
    const a2 = ((i + 1) % n) * ((Math.PI * 2) / n) - Math.PI / 2;
    const p1 = getPoint(a0);
    const p = getPoint(a1);
    const p2 = getPoint(a2);

    const v1 = normalize({ x: p.x - p1.x, y: p.y - p1.y });
    const v2 = normalize({ x: p.x - p2.x, y: p.y - p2.y });
    const inset = Math.min(radius, dist(p, p1) * 0.45, dist(p, p2) * 0.45);

    const start = { x: p.x - v1.x * inset, y: p.y - v1.y * inset };
    const end = { x: p.x - v2.x * inset, y: p.y - v2.y * inset };
    const handle = inset * 0.5522847498;

    const out = { x: start.x - v1.x * handle, y: start.y - v1.y * handle };
    const inn = { x: end.x - v2.x * handle, y: end.y - v2.y * handle };

    pts.push({
      x: start.x,
      y: start.y,
      out,
      in: null,
      pointType: radius > 0 ? "smooth" : "corner",
    });
    pts.push({
      x: end.x,
      y: end.y,
      in: inn,
      out: null,
      pointType: radius > 0 ? "smooth" : "corner",
    });
  }

  shape.points = pts;
  shape.closed = true;
  return shape;
}

function createWavePath(x: number, y: number, width: number, height: number, waves: number): Shape {
  const shape = baseShape("path", "Wave", x, y) as any as Shape & { points: any[]; closed: boolean };
  const w = width;
  const h = height;
  shape.width = w;
  shape.height = h;

  const pts: any[] = [];
  const amplitude = h / 4;
  const baseY = h / 2;
  const segments = Math.max(1, waves);
  const step = w / segments;

  pts.push({ x: 0, y: baseY, in: null, out: null, pointType: "smooth" });
  for (let i = 0; i < segments; i++) {
    const xMid = step * (i + 0.5);
    const xNext = step * (i + 1);
    const yPeak = baseY + (i % 2 === 0 ? -amplitude : amplitude);

    const prev = pts[pts.length - 1];
    const ctrlIn = { x: xMid - step * 0.25, y: prev.y };
    const ctrlOut = { x: xMid + step * 0.25, y: yPeak };

    pts.push({
      x: xMid,
      y: yPeak,
      in: ctrlIn,
      out: ctrlOut,
      pointType: "smooth",
    });

    const nextCtrlIn = { x: xNext - step * 0.25, y: yPeak };
    const nextCtrlOut = { x: xNext - step * 0.05, y: baseY };
    pts.push({
      x: xNext,
      y: baseY,
      in: nextCtrlIn,
      out: nextCtrlOut,
      pointType: "smooth",
    });
  }

  shape.points = pts;
  shape.closed = false;
  return shape;
}

function createArrowPath(x: number, y: number, width: number, height: number): Shape {
  const shape = baseShape("path", "Arrow", x, y) as any as Shape & { points: any[]; closed: boolean };
  const w = width;
  const h = height;
  shape.width = w;
  shape.height = h;
  const shaftH = h * 0.4;
  const headW = w * 0.35;
  const cy = h / 2;
  const pts = [
    { x: 0, y: cy - shaftH / 2 },
    { x: w - headW, y: cy - shaftH / 2 },
    { x: w - headW, y: cy - shaftH },
    { x: w, y: cy },
    { x: w - headW, y: cy + shaftH },
    { x: w - headW, y: cy + shaftH / 2 },
    { x: 0, y: cy + shaftH / 2 },
  ].map((p) => ({ ...p, in: null, out: null, pointType: "corner" as const }));
  shape.points = pts;
  shape.closed = true;
  return shape;
}

function normalize(v: { x: number; y: number }) {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
