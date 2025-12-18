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
} from "./types";

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
    shadow: { x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.16 },
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
    canvasBackground: { kind: "checkerboard" },
    canvasSize: { width: 1440, height: 900 },
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
    case "frame":
      return baseShape("rectangle", "Rectangle", at.x, at.y);
    case "ellipse":
      return baseShape("ellipse", "Ellipse", at.x, at.y);
    case "line":
      return baseShape("line", "Line", at.x, at.y);
    case "text":
      return baseShape("text", "Text", at.x, at.y);
    default:
      return baseShape("rectangle", "Rectangle", at.x, at.y);
  }
}
