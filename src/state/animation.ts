import { EditorDocument, PathPoint, Shape } from "./types";
import { findNode, updateShape } from "./layers";

export type AnimatableProperty = "position" | "rotation" | "scale" | "opacity" | "path";

export type TimelineMarker = {
  id: string;
  frame: number;
  label: string;
  color?: string;
};

export type TriggerType = "hover" | "click" | "focus" | "delay" | "in-view" | "scroll" | "loop" | "state";

export type ClipTrigger = {
  id: string;
  type: TriggerType;
  options?: Record<string, number | string | boolean>;
  once?: boolean;
  resetOnExit?: boolean;
  reverseOnLeave?: boolean;
};

export type CubicBezier = { type: "cubic-bezier"; c1: { x: number; y: number }; c2: { x: number; y: number } };
export type EasingPreset = "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type Easing = EasingPreset | CubicBezier;

export type AnimationKeyframe<T = any> = {
  id: string;
  frame: number;
  value: T;
  interpolation?: "linear" | "hold";
  easeIn?: Easing;
  easeOut?: Easing;
};

export type AnimationTrack = {
  id: string;
  property: AnimatableProperty;
  targetId: string;
  keyframes: AnimationKeyframe[];
  locked?: boolean;
  muted?: boolean;
};

export type AnimationSegment = {
  id: string;
  targetId: string;
  name: string;
  tracks: AnimationTrack[];
  triggers: ClipTrigger[];
  start: number;
  end: number;
  collapsed?: boolean;
  loop?: boolean;
  repeatable?: boolean;
  easing?: Easing;
};

export type AnimationClip = {
  id: string;
  targetId: string;
  name: string;
  segments: AnimationSegment[];
  collapsed?: boolean;
};

export type AnimationState = {
  open: boolean;
  playing: boolean;
  playhead: number;
  fps: number;
  duration: number;
  range: { start: number; end: number };
  loop: boolean;
  snapping: boolean;
  zoom: number;
  scrollX: number;
  autoKeyframe: boolean;
  markers: TimelineMarker[];
  sequences: AnimationClip[];
  lastWarning?: string | null;
  selectedKeyframeId?: string | null;
  activeSegmentId?: string | null;
};

export const DEFAULT_ANIMATION_STATE: AnimationState = {
  open: false,
  playing: false,
  playhead: 0,
  fps: 30,
  duration: 300,
  range: { start: 0, end: 300 },
  loop: false,
  snapping: true,
  zoom: 1,
  scrollX: 0,
  autoKeyframe: true,
  markers: [],
  sequences: [],
  lastWarning: null,
  selectedKeyframeId: null,
  activeSegmentId: null,
};

type PropertyDescriptor<T> = {
  type: "number" | "vec2" | "path";
  label: string;
  get: (shape: Shape) => T | null;
  apply: (shape: Shape, value: T) => Shape;
  patch: (shape: Shape, value: T) => Partial<Shape>;
  equals: (a: T | null, b: T | null) => boolean;
};

const PROPERTY_DEFS: Record<AnimatableProperty, PropertyDescriptor<any>> = {
  position: {
    type: "vec2",
    label: "Position",
    get: (s) => ({ x: s.x, y: s.y }),
    apply: (s, v) => ({ ...s, x: clampNumber(v?.x, 0, Infinity, s.x), y: clampNumber(v?.y, 0, Infinity, s.y) }),
    patch: (_s, v) => ({ x: clampNumber(v?.x, -100000, 100000, 0), y: clampNumber(v?.y, -100000, 100000, 0) }),
    equals: (a, b) => !a || !b ? false : almostEqual(a.x, b.x) && almostEqual(a.y, b.y),
  },
  rotation: {
    type: "number",
    label: "Rotation",
    get: (s) => s.rotation ?? 0,
    apply: (s, v) => ({ ...s, rotation: normalizeAngle(v ?? 0) }),
    patch: (_s, v) => ({ rotation: normalizeAngle(v ?? 0) }),
    equals: (a, b) => almostEqual((a ?? 0) as number, (b ?? 0) as number),
  },
  scale: {
    type: "vec2",
    label: "Scale",
    get: (s) => ({ x: s.scale?.x ?? 1, y: s.scale?.y ?? 1 }),
    apply: (s, v) => ({
      ...s,
      scale: { x: clampScale(v?.x, s.scale?.x ?? 1), y: clampScale(v?.y, s.scale?.y ?? 1) },
    }),
    patch: (_s, v) => ({
      scale: { x: clampScale(v?.x, 1), y: clampScale(v?.y, 1) },
    }),
    equals: (a, b) => !a || !b ? false : almostEqual(a.x, b.x) && almostEqual(a.y, b.y),
  },
  opacity: {
    type: "number",
    label: "Opacity",
    get: (s) => s.opacity ?? 1,
    apply: (s, v) => ({ ...s, opacity: clampNumber(v ?? 1, 0, 1, s.opacity ?? 1) }),
    patch: (_s, v) => ({ opacity: clampNumber(v ?? 1, 0, 1, 1) }),
    equals: (a, b) => almostEqual((a ?? 0) as number, (b ?? 0) as number),
  },
  path: {
    type: "path",
    label: "Path",
    get: (s) => (s.type === "path" ? structuredClone((s as any).points ?? []) : null),
    apply: (s, v) => {
      if (s.type !== "path" || !Array.isArray(v)) return s;
      return { ...(s as any), points: structuredClone(v) } as Shape;
    },
    patch: (s, v) => (s.type === "path" ? { points: structuredClone(v) as any } : {}),
    equals: (a, b) => {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        const q = b[i];
        if (!almostEqual(p.x, q.x) || !almostEqual(p.y, q.y)) return false;
        if (p.in || q.in) {
          if (!p.in || !q.in) return false;
          if (!almostEqual(p.in.x, q.in.x) || !almostEqual(p.in.y, q.in.y)) return false;
        }
        if (p.out || q.out) {
          if (!p.out || !q.out) return false;
          if (!almostEqual(p.out.x, q.out.x) || !almostEqual(p.out.y, q.out.y)) return false;
        }
      }
      return true;
    },
  },
};

export function ensureSequence(state: AnimationState, targetId: string, name: string) {
  const existing = state.sequences.find((s) => s.targetId === targetId);
  if (existing) return { state, sequence: normalizeSequence(existing) };
  const segment: AnimationSegment = {
    id: `seg_${crypto.randomUUID()}`,
    targetId,
    name: `${name} Segment`,
    tracks: [],
    triggers: [],
    start: 0,
    end: 150, // 5s default at 30fps
    collapsed: false,
    loop: false,
    repeatable: true,
  };
  const sequence: AnimationClip = {
    id: `clip_${crypto.randomUUID()}`,
    targetId,
    name,
    segments: [segment],
    collapsed: false,
  };
  const next = { ...state, sequences: [...state.sequences, sequence] };
  return { state: next, sequence };
}

export function normalizeSequence(seq: AnimationClip): AnimationClip {
  if ((seq as any).segments?.length) {
    return seq;
  }
  // migrate legacy tracks/triggers to a single segment
  const tracks = (seq as any).tracks ?? [];
  const triggers = (seq as any).triggers ?? [];
  const bounds = computeTrackBounds(tracks);
  const segment: AnimationSegment = {
    id: `seg_${crypto.randomUUID()}`,
    targetId: seq.targetId,
    name: seq.name,
    tracks,
    triggers,
    start: bounds.start ?? 0,
    end: bounds.end ?? 150,
    collapsed: false,
    loop: false,
    repeatable: true,
  };
  return { ...seq, segments: [segment] };
}

export function ensureTrack(
  state: AnimationState,
  targetId: string,
  property: AnimatableProperty,
  name: string,
  segmentId?: string
) {
  const { state: withSeq, sequence } = ensureSequence(state, targetId, name);
  const seq = normalizeSequence(sequence);
  const seg = segmentId ? seq.segments.find((s) => s.id === segmentId) ?? seq.segments[0] : seq.segments[0];
  const existing = seg.tracks.find((t) => t.property === property);
  if (existing) return { state: replaceSequence(withSeq, seq), track: existing, segment: seg };
  const track: AnimationTrack = { id: `track_${crypto.randomUUID()}`, property, targetId, keyframes: [] };
  const nextSegments = seq.segments.map((s) => (s.id === seg.id ? { ...s, tracks: [...s.tracks, track] } : s));
  const nextSeq = { ...seq, segments: normalizeSegmentBounds(nextSegments) };
  return { state: replaceSequence(withSeq, nextSeq), track, segment: nextSeq.segments.find((s) => s.id === seg.id)! };
}

function replaceSequence(state: AnimationState, updated: AnimationClip): AnimationState {
  const sequences = state.sequences.map((s) => (s.id === updated.id ? updated : s));
  return { ...state, sequences };
}

export function insertKeyframe(
  state: AnimationState,
  targetId: string,
  property: AnimatableProperty,
  frame: number,
  value: any,
  shapeName: string,
  segmentId?: string
) {
  const { state: withTrack, track, segment } = ensureTrack(state, targetId, property, shapeName, segmentId);
  if (property === "path" && track.keyframes.length) {
    const first = track.keyframes[0].value as PathPoint[] | undefined;
    if (!pathCountsMatch(first ?? [], value ?? [])) {
      return {
        state: { ...withTrack, lastWarning: "Morph requires the same number of path points. Adjust points to match." },
        keyframe: track.keyframes[0],
      };
    }
  }
  const nextTrack = { ...track };
  const existingIndex = nextTrack.keyframes.findIndex((k) => k.frame === frame);
  const keyframe: AnimationKeyframe = {
    id: existingIndex >= 0 ? nextTrack.keyframes[existingIndex].id : `kf_${crypto.randomUUID()}`,
    frame,
    value: structuredClone(value),
    interpolation: "linear",
    easeIn: nextTrack.keyframes[existingIndex]?.easeIn ?? "linear",
    easeOut: nextTrack.keyframes[existingIndex]?.easeOut ?? "linear",
  };
  if (existingIndex >= 0) nextTrack.keyframes.splice(existingIndex, 1, keyframe);
  else nextTrack.keyframes.push(keyframe);
  nextTrack.keyframes.sort((a, b) => a.frame - b.frame);
  const owner = withTrack.sequences.find((s) => s.targetId === targetId);
  const nextSequences = withTrack.sequences.map((seq) => {
    const normalized = normalizeSequence(seq);
    if (!owner || normalized.id !== owner.id) return normalized;
    const nextSegments = normalized.segments.map((seg) =>
      seg.id === (segment?.id ?? normalized.segments[0].id)
        ? { ...seg, tracks: seg.tracks.map((t) => (t.id === track.id ? nextTrack : t)) }
        : seg
    );
    return { ...normalized, segments: normalizeSegmentBounds(nextSegments) };
  });
  return { state: { ...withTrack, sequences: nextSequences, selectedKeyframeId: keyframe.id }, keyframe };
}

export function evaluateTrack(track: AnimationTrack, frame: number, fallback: any) {
  if (!track.keyframes.length) return fallback;
  const sorted = track.keyframes;
  if (frame <= sorted[0].frame) return sorted[0].value;
  if (frame >= sorted[sorted.length - 1].frame) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frame < a.frame || frame > b.frame) continue;
    if (a.frame === b.frame) return b.value;
    const tRaw = (frame - a.frame) / (b.frame - a.frame);
    const eased = applyEasing(tRaw, a.easeOut ?? b.easeIn ?? "linear");
    return interpolateValues(a.value, b.value, eased);
  }
  return fallback;
}

export function applyAnimationToDocument(doc: EditorDocument, anim: AnimationState): EditorDocument {
  if (!anim.open) return doc;
  let next: EditorDocument | null = null;

  for (const sequence of anim.sequences) {
    const normalized = normalizeSequence(sequence);
    const node = findNode(doc.layers, normalized.targetId);
    if (!node || node.node.kind !== "shape") continue;
    const shape = node.node.shape;
    const activeSegments = normalized.segments
      .map((s) => normalizeSegmentWindow(s))
      .filter((s) => anim.playhead >= s.start && anim.playhead <= s.end);
    if (!activeSegments.length) continue;
    const active = activeSegments[activeSegments.length - 1];
    const localSpan = Math.max(1, active.end - active.start);
    const localT = Math.max(0, Math.min(1, (anim.playhead - active.start) / localSpan));
    const easedT = applyEasing(localT, active.easing ?? "linear");
    const easedFrame = active.start + easedT * localSpan;
    let patch: Partial<Shape> = {};
    for (const track of active.tracks) {
      if (track.muted) continue;
      const def = PROPERTY_DEFS[track.property];
      const current = def.get(shape);
      const value = evaluateTrack(track, easedFrame, current);
      if (value == null) continue;
      const part = def.patch(shape, value);
      if (Object.keys(part).length) {
        patch = { ...patch, ...part };
      }
    }
    if (Object.keys(patch).length) {
      if (!next) next = structuredClone(doc);
      updateShape(next.layers, sequence.targetId, (s) => ({ ...s, ...patch }));
    }
  }

  return next ?? doc;
}

export function detectChangedProperties(prev: Shape, next: Shape): AnimatableProperty[] {
  const changed: AnimatableProperty[] = [];
  (Object.keys(PROPERTY_DEFS) as AnimatableProperty[]).forEach((prop) => {
    const def = PROPERTY_DEFS[prop];
    const a = def.get(prev);
    const b = def.get(next);
    if (!def.equals(a, b)) changed.push(prop);
  });
  return changed;
}

export function getPropertyDescriptor(prop: AnimatableProperty) {
  return PROPERTY_DEFS[prop];
}

export function pathCountsMatch(a: PathPoint[] | null, b: PathPoint[] | null) {
  if (!a || !b) return false;
  return a.length === b.length;
}

function interpolateValues(a: any, b: any, t: number) {
  if (typeof a === "number" && typeof b === "number") {
    return a + (b - a) * t;
  }
  if (a && b && typeof a === "object" && "x" in a && "y" in a) {
    return { x: (a as any).x + ((b as any).x - (a as any).x) * t, y: (a as any).y + ((b as any).y - (a as any).y) * t };
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((pt, idx) => {
      const pb = b[idx];
      return {
        x: pt.x + (pb.x - pt.x) * t,
        y: pt.y + (pb.y - pt.y) * t,
        in: pt.in && pb.in ? { x: pt.in.x + (pb.in.x - pt.in.x) * t, y: pt.in.y + (pb.in.y - pt.in.y) * t } : pt.in ?? null,
        out: pt.out && pb.out ? { x: pt.out.x + (pb.out.x - pt.out.x) * t, y: pt.out.y + (pb.out.y - pt.out.y) * t } : pt.out ?? null,
        pointType: pb.pointType ?? pt.pointType,
      } as PathPoint;
    });
  }
  return b;
}

function applyEasing(t: number, easing: Easing) {
  const clamped = Math.max(0, Math.min(1, t));
  if (typeof easing === "string") {
    if (easing === "ease-in") return clamped * clamped;
    if (easing === "ease-out") return 1 - (1 - clamped) * (1 - clamped);
    if (easing === "ease-in-out") {
      if (clamped < 0.5) return 2 * clamped * clamped;
      return 1 - 2 * (1 - clamped) * (1 - clamped);
    }
    return clamped;
  }
  return cubicBezierEasing(easing.c1, easing.c2)(clamped);
}

function cubicBezierEasing(c1: { x: number; y: number }, c2: { x: number; y: number }) {
  const cx = 3 * c1.x;
  const bx = 3 * (c2.x - c1.x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * c1.y;
  const by = 3 * (c2.y - c1.y) - cy;
  const ay = 1 - cy - by;
  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveCurveX = (x: number) => {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      const d2 = sampleDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2 / d2;
    }
    let t0 = 0;
    let t1 = 1;
    t2 = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < 1e-6) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return t2;
  };

  return (x: number) => sampleCurveY(solveCurveX(x));
}

function normalizeAngle(v: number) {
  let n = v % 360;
  if (n < -360) n = -360;
  if (n > 360) n = 360;
  return n;
}

function almostEqual(a: number, b: number, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

function clampNumber(value: number | undefined | null, min: number, max: number, fallback: number) {
  const v = Number.isFinite(value as number) ? (value as number) : fallback;
  return Math.max(min, Math.min(max, v));
}

function clampScale(value: number | undefined | null, fallback: number) {
  const v = Number.isFinite(value as number) ? (value as number) : fallback;
  const sign = v < 0 ? -1 : 1;
  const magnitude = Math.max(0.01, Math.min(100, Math.abs(v)));
  return sign * magnitude;
}

function computeTrackBounds(tracks: AnimationTrack[]) {
  const frames = tracks.flatMap((t) => t.keyframes.map((k) => k.frame));
  if (!frames.length) return { start: 0, end: 150 };
  const min = Math.min(...frames);
  const max = Math.max(...frames);
  return { start: min, end: frames.length === 1 ? min + 150 : max };
}

export function normalizeSegmentWindow(segment: AnimationSegment): AnimationSegment {
  const bounds = computeTrackBounds(segment.tracks);
  const start = Math.min(segment.start ?? bounds.start, bounds.start);
  const end = Math.max(segment.end ?? bounds.end, bounds.end);
  return { ...segment, start, end };
}

function normalizeSegmentBounds(segments: AnimationSegment[]) {
  return segments.map((s) => normalizeSegmentWindow(s));
}
