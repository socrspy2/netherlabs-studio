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
import {
  AnimationState,
  AnimatableProperty,
  ClipTrigger,
  DEFAULT_ANIMATION_STATE,
  AnimationSegment,
  applyAnimationToDocument,
  detectChangedProperties,
  getPropertyDescriptor,
  insertKeyframe,
  normalizeSequence,
} from "./animation";

export const DEFAULT_GRID: GridSettings = { size: 10, color: "#94a3b8", visible: true, magnetic: true };

type History = {
  past: EditorDocument[];
  future: EditorDocument[];
};

type EditorContextValue = {
  doc: EditorDocument;
  resolvedDoc: EditorDocument;
  history: History;
  animation: AnimationState;
  checkpoint: () => void;
  setCanvasBackground: (bg: EditorDocument["canvasBackground"]) => void;
  setCanvasSize: (size: EditorDocument["canvasSize"]) => void;
  setGrid: (grid: Partial<GridSettings>) => void;
  preview: boolean;
  setPreview: (v: boolean) => void;
  setTimelineOpen: (v: boolean) => void;
  setPlayhead: (frame: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setTimelineRange: (range: { start: number; end: number }) => void;
  setTimelineFps: (fps: number) => void;
  setTimelineDuration: (frames: number) => void;
  setTimelineZoom: (zoom: number) => void;
  toggleLoop: () => void;
  toggleSnapping: () => void;
  toggleAutoKeyframe: () => void;
  addMarker: (frame: number, label?: string) => void;
  removeMarker: (id: string) => void;
  createAnimatedTrack: (id: string, prop: AnimatableProperty) => void;
  addKeyframeAtPlayhead: (id: string, prop: AnimatableProperty, segmentId?: string) => void;
  moveKeyframe: (keyframeId: string, frame: number) => void;
  updateKeyframeEasing: (keyframeId: string, easing: { easeIn?: any; easeOut?: any }) => void;
  selectKeyframe: (id: string | null) => void;
  setSequenceTriggers: (targetId: string, segmentId: string, triggers: ClipTrigger[]) => void;
  addSegment: (targetId: string, name?: string) => AnimationSegment | null;
  updateSegment: (targetId: string, segmentId: string, changes: Partial<AnimationSegment>) => void;
  deleteSegment: (targetId: string, segmentId: string) => void;
  playSegment: (targetId: string, segmentId: string) => void;
  setTool: (tool: ToolId) => void;
  setSelection: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  updateViewport: (vp: Partial<ViewportState>) => void;
  createShape: (shape: Shape) => void;
  updateShapeProps: (id: string, changes: Partial<Shape> | ((shape: Shape) => Shape)) => void;
  applyShapePatches: (patches: { id: string; changes: Partial<Shape> | ((shape: Shape) => Shape) }[], pushHistory?: boolean) => void;
  moveSelection: (dx: number, dy: number, pushHistory?: boolean, ids?: string[]) => void;
  resizeSelection: (rect: { x: number; y: number; width: number; height: number }, pushHistory?: boolean, ids?: string[]) => void;
  rotateSelection: (rotation: number, pushHistory?: boolean, ids?: string[]) => void;
  deleteSelection: (ids?: string[]) => void;
  duplicateSelection: (ids?: string[]) => void;
  bring: (dir: "front" | "back" | "up" | "down", ids?: string[]) => void;
  moveLayer: (draggedId: string, targetId: string, position: "before" | "after") => void;
  makeMaskFromSelection: (ids?: string[]) => void;
  toggleMask: (id: string, maskId?: string) => void;
  toggleVisible: (id: string) => void;
  toggleLocked: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  groupSelected: (ids?: string[]) => void;
  ungroupSelected: (ids?: string[]) => void;
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
    quality: "medium" as const,
  };

  const common = {
    id: crypto.randomUUID(),
    name,
    type,
    x,
    y,
    width: 160,
    height: 120,
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: fillDefault,
    stroke: strokeDefault,
    radius: { tl: 8, tr: 8, br: 8, bl: 8 },
    shadow: { enabled: true, x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.16, quality: "medium" },
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
      fontStyle: "normal",
      fontSize: 24,
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: 0,
      align: "left",
      verticalAlign: "top",
      textColor: "#e2e8f0",
      textFill: { enabled: true, kind: "solid", color: "#e2e8f0", opacity: 1 },
    } as Shape;
  }

  if (type === "line") {
    return { ...common, fill: { ...common.fill, enabled: false }, height: 0 } as Shape;
  }

  if (type === "path") {
    return { ...common, type: "path", points: [], closed: false } as any;
  }

  if (type === "image") {
    return {
      ...common,
      type: "image",
      src: "",
      mediaKind: "image",
      fillMode: "cover",
      fillOffset: { x: 0, y: 0 },
      fillScale: 1,
      repeat: false,
      masks: [],
      playback: { autoplay: true, loop: true, muted: true },
    } as any;
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
  text.letterSpacing = 0;
  text.fontStyle = "normal";
  text.verticalAlign = "top";
  text.textColor = "#e2e8f0";
  text.textFill = { enabled: true, kind: "solid", color: "#e2e8f0", opacity: 1 };
  text.width = 260;
  text.height = 140;

  const maskShape = baseShape("rectangle", "Mask", 960, 320);
  maskShape.width = 220;
  maskShape.height = 180;
  maskShape.fill = { enabled: true, kind: "solid", color: "#0ea5e9", opacity: 0.6 };
  const maskedShape = baseShape("ellipse", "Masked layer", 960, 320);
  maskedShape.width = 240;
  maskedShape.height = 200;
  maskedShape.fill = { enabled: true, kind: "solid", color: "#c084fc", opacity: 0.9 };
  const maskGroup: LayerNode = {
    id: `mask_${crypto.randomUUID()}`,
    kind: "group",
    name: "Masked demo",
    visible: true,
    locked: false,
    mask: { enabled: true, maskId: maskShape.id },
    children: [
      { id: maskShape.id, kind: "shape", shape: maskShape },
      { id: maskedShape.id, kind: "shape", shape: maskedShape },
    ],
  };

  return {
    layers: [
      { id: rect.id, kind: "shape", shape: rect },
      { id: ellipse.id, kind: "shape", shape: ellipse },
      { id: text.id, kind: "shape", shape: text },
      maskGroup,
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
  const [animation, setAnimation] = useState<AnimationState>(() => DEFAULT_ANIMATION_STATE);
  const resolvedDoc = useMemo(() => applyAnimationToDocument(doc, animation), [doc, animation]);

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

  const autoKeyframeChanges = useCallback(
    (prevDoc: EditorDocument, nextDoc: EditorDocument, ids: string[]) => {
      setAnimation((anim) => {
        if (!anim.open || !anim.autoKeyframe || anim.playing) return anim;
        let nextState = anim;
        const frame = Math.max(anim.range.start, Math.min(anim.range.end, Math.round(anim.playhead)));
        ids.forEach((id) => {
          const prevNode = flatten(prevDoc.layers).find((n) => n.id === id);
          const nextNode = flatten(nextDoc.layers).find((n) => n.id === id);
          if (!prevNode || !nextNode || prevNode.kind !== "shape" || nextNode.kind !== "shape") return;
          const changed = detectChangedProperties(prevNode.shape, nextNode.shape);
          changed.forEach((prop) => {
            const def = getPropertyDescriptor(prop);
            const value = def.get(nextNode.shape);
            if (value == null) return;
            const res = insertKeyframe(nextState, id, prop, frame, value, nextNode.shape.name);
            nextState = res.state;
          });
        });
        return nextState;
      });
    },
    []
  );

  const commit = useCallback(
    (next: EditorDocument, pushHistory = true, changedIds?: string[]) => {
      const prev = doc;
      setDoc(next);
      if (pushHistory) {
        setHistory((h) => ({
          past: [...h.past.slice(-40), prev],
          future: [],
        }));
      }
      if (changedIds?.length) {
        autoKeyframeChanges(prev, next, changedIds);
      }
    },
    [autoKeyframeChanges, doc]
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
      commit(nextDoc, true, [shape.id]);
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
      const changedIds = Array.from(new Set(patches.map((p) => p.id)));
      commit(next, pushHistory, changedIds);
    },
    [commit, doc]
  );

  const updateShapeProps = useCallback(
    (id: string, changes: Partial<Shape> | ((shape: Shape) => Shape)) => {
      const next = structuredClone(doc);
      updateShape(next.layers, id, (shape) => (typeof changes === "function" ? (changes as any)(shape) : { ...shape, ...changes }));
      commit(next, true, [id]);
    },
    [commit, doc]
  );

  const moveSelection = useCallback(
    (dx: number, dy: number, pushHistory = false, ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      if (!targetIds.length) return;
      const next = structuredClone(doc);
      for (const id of targetIds) {
        updateShape(next.layers, id, (shape) => ({ ...shape, x: shape.x + dx, y: shape.y + dy }));
      }
      commit(next, pushHistory, targetIds);
    },
    [commit, doc]
  );

  const resizeSelection = useCallback(
    (rect: { x: number; y: number; width: number; height: number }, pushHistory = false, ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      if (!targetIds.length) return;
      const next = structuredClone(doc);
      for (const id of targetIds) {
        updateShape(next.layers, id, (shape) => ({
          ...shape,
          x: rect.x,
          y: rect.y,
          width: Math.max(4, rect.width),
          height: Math.max(4, rect.height),
        }));
      }
      commit(next, pushHistory, targetIds);
    },
    [commit, doc]
  );

  const rotateSelection = useCallback(
    (rotation: number, pushHistory = false, ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      if (!targetIds.length) return;
      const next = structuredClone(doc);
      for (const id of targetIds) {
        updateShape(next.layers, id, (shape) => ({ ...shape, rotation }));
      }
      commit(next, pushHistory, targetIds);
    },
    [commit, doc]
  );

  const setTimelineOpen = useCallback((open: boolean) => {
    setAnimation((a) => ({ ...a, open, playing: open ? a.playing : false }));
  }, []);

  const setPlayhead = useCallback((frame: number) => {
    setAnimation((a) => ({
      ...a,
      playhead: Math.max(a.range.start, Math.min(a.range.end, Number.isFinite(frame) ? frame : a.playhead)),
    }));
  }, []);

  const play = useCallback(() => {
    setAnimation((a) => ({ ...a, open: true, playing: true, lastWarning: null }));
  }, []);

  const pause = useCallback(() => {
    setAnimation((a) => ({ ...a, playing: false }));
  }, []);

  const stop = useCallback(() => {
    setAnimation((a) => ({ ...a, playing: false, playhead: a.range.start, activeSegmentId: null }));
  }, []);

  const setTimelineRange = useCallback((range: { start: number; end: number }) => {
    setAnimation((a) => {
      const start = Math.max(0, Math.min(range.start, range.end));
      const end = Math.max(start, Math.min(range.end, a.duration));
      return { ...a, range: { start, end }, playhead: Math.min(Math.max(a.playhead, start), end) };
    });
  }, []);

  const setTimelineFps = useCallback((fps: number) => {
    setAnimation((a) => ({ ...a, fps: Math.max(1, Math.min(240, Math.round(fps) || a.fps)) }));
  }, []);

  const setTimelineDuration = useCallback((frames: number) => {
    setAnimation((a) => {
      const duration = Math.max(1, Math.round(frames) || a.duration);
      const end = Math.min(duration, Math.max(a.range.end, a.range.start));
      const start = Math.min(a.range.start, end);
      return { ...a, duration, range: { start, end }, playhead: Math.min(a.playhead, end) };
    });
  }, []);

  const setTimelineZoom = useCallback((zoom: number) => {
    setAnimation((a) => ({ ...a, zoom: Math.max(0.25, Math.min(4, zoom || a.zoom)) }));
  }, []);

  const toggleLoop = useCallback(() => {
    setAnimation((a) => ({ ...a, loop: !a.loop }));
  }, []);

  const toggleSnapping = useCallback(() => {
    setAnimation((a) => ({ ...a, snapping: !a.snapping }));
  }, []);

  const toggleAutoKeyframe = useCallback(() => {
    setAnimation((a) => ({ ...a, autoKeyframe: !a.autoKeyframe }));
  }, []);

  const addMarker = useCallback((frame: number, label?: string) => {
    setAnimation((a) => ({
      ...a,
      markers: [...a.markers, { id: `marker_${crypto.randomUUID()}`, frame, label: label || `Marker ${a.markers.length + 1}` }],
    }));
  }, []);

  const removeMarker = useCallback((id: string) => {
    setAnimation((a) => ({ ...a, markers: a.markers.filter((m) => m.id !== id) }));
  }, []);

  const createAnimatedTrack = useCallback(
    (id: string, prop: AnimatableProperty) => {
      const node = flatten(resolvedDoc.layers).find((n) => n.kind === "shape" && n.id === id) as ShapeNode | undefined;
      if (!node) return;
      const def = getPropertyDescriptor(prop);
      const value = def.get(node.shape);
      if (value == null) return;
      setAnimation((anim) => {
        const res = insertKeyframe(anim, id, prop, Math.round(anim.playhead), value, node.shape.name);
        return { ...res.state, open: true };
      });
    },
    [resolvedDoc.layers]
  );

  const addKeyframeAtPlayhead = useCallback(
    (id: string, prop: AnimatableProperty, segmentId?: string) => {
      const node = flatten(resolvedDoc.layers).find((n) => n.kind === "shape" && n.id === id) as ShapeNode | undefined;
      if (!node) return;
      const def = getPropertyDescriptor(prop);
      const value = def.get(node.shape);
      if (value == null) return;
      setAnimation((anim) => insertKeyframe(anim, id, prop, Math.round(anim.playhead), value, node.shape.name, segmentId).state);
    },
    [resolvedDoc.layers]
  );

  const moveKeyframe = useCallback((keyframeId: string, frame: number) => {
    setAnimation((anim) => {
      let updated = false;
      const nextSequences = anim.sequences.map((seq) => {
        const normalized = normalizeSequence(seq);
        const nextSegments = normalized.segments.map((segment) => {
          let segChanged = false;
          const nextTracks = segment.tracks.map((track) => {
            const idx = track.keyframes.findIndex((k) => k.id === keyframeId);
            if (idx === -1) return track;
            segChanged = true;
            updated = true;
            const nextTrack = { ...track };
            const kf = { ...nextTrack.keyframes[idx], frame: Math.round(frame) };
            const keyframes = [...nextTrack.keyframes];
            keyframes.splice(idx, 1, kf);
            keyframes.sort((a, b) => a.frame - b.frame);
            nextTrack.keyframes = keyframes;
            return nextTrack;
          });
          return segChanged ? { ...segment, tracks: nextTracks } : segment;
        });
        return { ...normalized, segments: nextSegments };
      });
      if (!updated) return anim;
      return { ...anim, sequences: nextSequences, selectedKeyframeId: keyframeId };
    });
  }, []);

  const updateKeyframeEasing = useCallback((keyframeId: string, easing: { easeIn?: any; easeOut?: any }) => {
    setAnimation((anim) => {
      let updated = false;
      const nextSequences = anim.sequences.map((seq) => {
        const normalized = normalizeSequence(seq);
        const nextSegments = normalized.segments.map((segment) => {
          const nextTracks = segment.tracks.map((track) => {
            const idx = track.keyframes.findIndex((k) => k.id === keyframeId);
            if (idx === -1) return track;
            updated = true;
            const nextTrack = { ...track };
            const keyframes = [...nextTrack.keyframes];
            const kf = { ...keyframes[idx] };
            if (easing.easeIn !== undefined) kf.easeIn = easing.easeIn;
            if (easing.easeOut !== undefined) kf.easeOut = easing.easeOut;
            keyframes.splice(idx, 1, kf);
            nextTrack.keyframes = keyframes;
            return nextTrack;
          });
          return { ...segment, tracks: nextTracks };
        });
        return { ...normalized, segments: nextSegments };
      });
      if (!updated) return anim;
      return { ...anim, sequences: nextSequences };
    });
  }, []);

  const selectKeyframe = useCallback((id: string | null) => {
    setAnimation((a) => ({ ...a, selectedKeyframeId: id ?? null }));
  }, []);

  const setSequenceTriggers = useCallback((targetId: string, segmentId: string, triggers: ClipTrigger[]) => {
    setAnimation((a) => ({
      ...a,
      sequences: a.sequences.map((seq) => {
        if (seq.targetId !== targetId) return seq;
        const normalized = normalizeSequence(seq);
        const nextSegments = normalized.segments.map((seg) =>
          seg.id === segmentId ? { ...seg, triggers: structuredClone(triggers) } : seg
        );
        return { ...normalized, segments: nextSegments };
      }),
    }));
  }, []);

  const addSegment = useCallback(
    (targetId: string, name?: string) => {
      const seq = animation.sequences.find((s) => s.targetId === targetId);
      if (!seq) return null;
      const normalized = (seq as any).segments?.length ? seq : { ...seq, segments: (seq as any).segments ?? [] };
      const start = Math.round(animation.playhead);
      const end = start + Math.max(60, Math.round(animation.fps * 1.5));
      const segment = {
        id: `seg_${crypto.randomUUID()}`,
        targetId,
        name: name || `Segment ${normalized.segments.length + 1}`,
        tracks: [],
        triggers: [],
        start,
        end,
        loop: false,
        repeatable: true,
        collapsed: false,
      } as AnimationSegment;
      setAnimation((a) => ({
        ...a,
        sequences: a.sequences.map((s) => (s.id === seq.id ? { ...normalizeSequence(s as any), segments: [...normalizeSequence(s as any).segments, segment] } : s)),
      }));
      return segment;
    },
    [animation.fps, animation.playhead, animation.sequences]
  );

  const updateSegment = useCallback((targetId: string, segmentId: string, changes: Partial<AnimationSegment>) => {
    setAnimation((a) => ({
      ...a,
      sequences: a.sequences.map((seq) => {
        if (seq.targetId !== targetId) return seq;
        const normalized = normalizeSequence(seq as any);
        const nextSegments = normalized.segments.map((seg: any) =>
          seg.id === segmentId ? { ...seg, ...changes } : seg
        );
        return { ...normalized, segments: nextSegments };
      }),
    }));
  }, []);

  const deleteSegment = useCallback((targetId: string, segmentId: string) => {
    setAnimation((a) => {
      const sequences = a.sequences
        .map((seq) => {
          if (seq.targetId !== targetId) return seq;
          const normalized = normalizeSequence(seq as any);
          const remaining = normalized.segments.filter((s) => s.id !== segmentId);
          if (!remaining.length) return null;
          return { ...normalized, segments: remaining };
        })
        .filter(Boolean) as AnimationState["sequences"];
      return { ...a, sequences };
    });
  }, []);

  const playSegment = useCallback(
    (targetId: string, segmentId: string) => {
      const seq = animation.sequences.find((s) => s.targetId === targetId);
      if (!seq) return;
      const normalized = normalizeSequence(seq as any);
      const seg = normalized.segments.find((s) => s.id === segmentId);
      if (!seg) return;
      const start = Math.round(seg.start);
      const end = Math.round(seg.end);
      setAnimation((a) => ({
        ...a,
        open: true,
        playing: true,
        playhead: start,
        range: { start, end },
        activeSegmentId: `${targetId}:${segmentId}`,
      }));
    },
    [animation.sequences]
  );

  React.useEffect(() => {
    if (!animation.playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setAnimation((anim) => {
        if (!anim.playing) return anim;
        const frameDelta = dt * anim.fps;
        let frame = anim.playhead + frameDelta;
        let playing: boolean = anim.playing;
        const activeSeg = anim.activeSegmentId
          ? (() => {
              const [tid, sid] = (anim.activeSegmentId ?? "").split(":");
              const seq = anim.sequences.find((s) => s.targetId === tid);
              const seg = seq ? normalizeSequence(seq as any).segments.find((s) => s.id === sid) : null;
              return seg ?? null;
            })()
          : null;
        const start = activeSeg ? activeSeg.start : anim.range.start;
        const end = activeSeg ? activeSeg.end : anim.range.end;
        if (frame > end) {
          if ((activeSeg?.loop ?? anim.loop)) frame = start;
          else {
            frame = end;
            playing = false;
          }
        }
        return { ...anim, playhead: frame, playing };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame((now) => {
      last = now;
      tick(now);
    });
    return () => cancelAnimationFrame(raf);
  }, [animation.playing, animation.fps, animation.range.end, animation.range.start]);

  const deleteSelection = useCallback(
    (ids?: string[]) => {
      const targets = ids ?? doc.selection;
      if (!targets.length) return;
      const idSet = new Set(targets);
      const next = structuredClone(doc);
      next.layers = removeNodes(next.layers, idSet);
      next.selection = next.selection.filter((id) => !idSet.has(id));
      commit(next);
    },
    [commit, doc]
  );

  const duplicateSelection = useCallback(
    (ids?: string[]) => {
      const targets = ids ?? doc.selection;
      if (!targets.length) return;
      const next = structuredClone(doc);
      const all = flatten(next.layers);
      const created: string[] = [];
      for (const id of targets) {
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
    },
    [commit, doc]
  );

  const bring = useCallback(
    (dir: "front" | "back" | "up" | "down", ids?: string[]) => {
      const targets = ids ?? doc.selection;
      if (!targets.length) return;
      const next = structuredClone(doc);
      next.layers = reorder(next.layers, targets[0], dir);
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

  const makeMaskFromSelection = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      if (targetIds.length < 2) return;
    const next = structuredClone(doc);
    const flat = flatten(next.layers);
      const selectedNodes = flat.filter((n) => targetIds.includes(n.id));
    const target = selectedNodes.find((n) => n.kind === "shape" && (n as any).shape.type === "image") as ShapeNode | undefined;
    const maskShapes = selectedNodes.filter((n) => n.kind === "shape" && (!target || n.id !== target.id)) as ShapeNode[];

    if (target && maskShapes.length) {
      const targetShape = target.shape as any;
      const masks = Array.from(targetShape.masks ?? []);
      maskShapes.forEach((m) => {
        const clone = structuredClone(m.shape) as Shape;
        clone.x = clone.x - targetShape.x;
        clone.y = clone.y - targetShape.y;
        masks.push({
          id: crypto.randomUUID(),
          kind: "shape",
          name: m.shape.name,
          visible: true,
          inverted: false,
          shape: clone,
        });
        m.shape.visible = false;
      });
      targetShape.masks = masks as any;
        next.selection = [target.id];
      commit(next);
      return;
    }

      next.layers = maskGroupWithinSameParent(next.layers, targetIds, "Mask");
    const grouped = flatten(next.layers).find((n) => n.kind === "group" && n.mask?.enabled);
    next.selection = grouped ? [grouped.id] : [];
    commit(next);
    },
    [commit, doc]
  );

  const toggleMask = useCallback(
    (id: string, maskId?: string) => {
      const next = structuredClone(doc);
      const flat = flatten(next.layers);
      const groupNode = flat.find((n) => n.kind === "group" && n.id === id) as any;
      if (groupNode?.mask) {
        groupNode.mask.enabled = !groupNode.mask.enabled;
        commit(next);
        return;
      }
      const shapeNode = flat.find((n) => n.kind === "shape" && n.id === id) as any;
      if (shapeNode?.shape?.type === "image" && shapeNode.shape.masks?.length) {
        const masks = shapeNode.shape.masks as any[];
        const targetMask = maskId ? masks.find((m) => m.id === maskId) : masks[0];
        if (targetMask) {
          targetMask.visible = targetMask.visible === false ? true : !targetMask.visible;
          commit(next);
        }
      }
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

  const groupSelected = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      if (targetIds.length < 1) return;
    const next = structuredClone(doc);
      next.layers = groupWithinSameParent(next.layers, targetIds, "Group");
      const selectedSet = new Set(targetIds);
    const grouped = flatten(next.layers).find((n) => {
      if (n.kind !== "group") return false;
      const childIds = new Set(n.children.map((c) => c.id));
      if (childIds.size !== selectedSet.size) return false;
      for (const id of selectedSet) if (!childIds.has(id)) return false;
      return true;
    });
    next.selection = grouped ? [grouped.id] : [];
    commit(next);
    },
    [commit, doc]
  );

  const ungroupSelected = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? doc.selection;
      const target = targetIds[0];
      if (!target) return;
    const next = structuredClone(doc);
      next.layers = ungroup(next.layers, target);
    next.selection = [];
    commit(next);
    },
    [commit, doc]
  );

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
      resolvedDoc,
      history,
      animation,
      checkpoint,
      setCanvasBackground,
      setCanvasSize,
      setGrid,
      preview,
      setPreview,
      setTimelineOpen,
      setPlayhead,
      play,
      pause,
      stop,
      setTimelineRange,
      setTimelineFps,
      setTimelineDuration,
      setTimelineZoom,
      toggleLoop,
      toggleSnapping,
      toggleAutoKeyframe,
      addMarker,
      removeMarker,
      createAnimatedTrack,
      addKeyframeAtPlayhead,
      moveKeyframe,
      updateKeyframeEasing,
      selectKeyframe,
      setSequenceTriggers,
      addSegment,
      updateSegment,
      deleteSegment,
      playSegment,
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
      resolvedDoc,
      history,
      animation,
      checkpoint,
      setCanvasBackground,
      setCanvasSize,
      setGrid,
      preview,
      setPreview,
      setTimelineOpen,
      setPlayhead,
      play,
      pause,
      stop,
      setTimelineRange,
      setTimelineFps,
      setTimelineDuration,
      setTimelineZoom,
      toggleLoop,
      toggleSnapping,
      toggleAutoKeyframe,
      addMarker,
      removeMarker,
      createAnimatedTrack,
      addKeyframeAtPlayhead,
      moveKeyframe,
      updateKeyframeEasing,
      selectKeyframe,
      setSequenceTriggers,
      addSegment,
      updateSegment,
      deleteSegment,
      playSegment,
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
