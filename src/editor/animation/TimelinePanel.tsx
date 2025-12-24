import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Square, Flag, Plus, ZoomIn, ZoomOut, ChevronDown, ChevronRight, RefreshCw, Repeat } from "lucide-react";
import { useEditor } from "../../state/editorStore";
import { AnimatableProperty, TriggerType, normalizeSequence } from "../../state/animation";
import { flatten } from "../../state/layers";

const PROPERTY_LABELS: { id: AnimatableProperty; label: string }[] = [
  { id: "position", label: "Transform (x, y)" },
  { id: "rotation", label: "Rotation" },
  { id: "scale", label: "Scale" },
  { id: "opacity", label: "Opacity" },
  { id: "path", label: "Path" },
];

const TRIGGER_TYPES: TriggerType[] = ["hover", "click", "focus", "delay", "in-view", "scroll", "loop", "state"];

const defaultCubic = { c1: { x: 0.25, y: 0.1 }, c2: { x: 0.25, y: 1 } };

export function TimelinePanel() {
  const {
    doc,
    animation,
    setTimelineOpen,
    setPlayhead,
    play,
  pause,
  stop,
  setTimelineFps,
  setTimelineRange,
  setTimelineDuration,
  setTimelineZoom,
  toggleLoop,
  toggleSnapping,
  toggleAutoKeyframe,
  addMarker,
  removeMarker,
  addKeyframeAtPlayhead,
  moveKeyframe,
  updateKeyframeEasing,
  selectKeyframe,
  setSequenceTriggers,
  addSegment,
  updateSegment,
  deleteSegment,
} = useEditor();
  const [height, setHeight] = useState(280);
  const [draggingKf, setDraggingKf] = useState<{ id: string; trackId: string } | null>(null);
  const [kfMenu, setKfMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingSeg, setDraggingSeg] = useState<{ segId: string; startOffset: number; duration: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const flattened = useMemo(() => flatten(doc.layers), [doc.layers]);
  const layerOptions = useMemo(
    () => flattened.filter((n) => n.kind === "shape").map((n: any) => ({ id: n.id, name: n.shape?.name ?? "Layer" })),
    [flattened]
  );

  const rows = useMemo(() => {
    const out: { seqId: string; segId: string; segIndex: number; seqName: string; layerName: string; seg: any }[] = [];
    animation.sequences.forEach((seq) => {
      const normalized = normalizeSequence(seq as any);
      const layer = flattened.find((n) => n.id === normalized.targetId && n.kind === "shape") as any;
      const name = layer?.shape?.name ?? normalized.name ?? "Sequence";
      normalized.segments.forEach((seg, idx) => {
        out.push({ seqId: normalized.id, segId: seg.id, segIndex: idx, seqName: name, layerName: name, seg });
      });
    });
    return out;
  }, [animation.sequences, flattened]);

  const rowLayouts = useMemo(() => {
    const layouts: { segId: string; top: number; height: number }[] = [];
    let y = 0;
    rows.forEach((row) => {
      const trackHeight = row.seg.collapsed ? 0 : row.seg.tracks.length * 24;
      const graphHeight = row.seg.collapsed ? 0 : 42;
      const base = row.seg.collapsed ? 30 : 72;
      const h = base + trackHeight + graphHeight;
      layouts.push({ segId: row.seg.id, top: y, height: h });
      y += h;
    });
    return { layouts, total: layouts.reduce((acc, l) => acc + l.height, 0) };
  }, [rows]);

  const colorForSeg = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 55%)`;
  };

  const easingToCubic = (easing: any) => {
    if (typeof easing === "object" && easing?.type === "cubic-bezier") return easing;
    if (easing === "ease-in") return { type: "cubic-bezier", c1: { x: 0.42, y: 0 }, c2: { x: 1, y: 1 } };
    if (easing === "ease-out") return { type: "cubic-bezier", c1: { x: 0, y: 0 }, c2: { x: 0.58, y: 1 } };
    if (easing === "ease-in-out" || easing === "ease") return { type: "cubic-bezier", c1: { x: 0.42, y: 0 }, c2: { x: 0.58, y: 1 } };
    return { type: "cubic-bezier", ...defaultCubic };
  };

  const pxPerFrame = Math.max(4, 8 * animation.zoom);
  const rangeSize = Math.max(1, animation.range.end - animation.range.start);
  const timelineWidth = Math.max(900, rangeSize * pxPerFrame + 240);

  const scrubTo = (clientX: number) => {
    if (!timelineRef.current) return;
    const bounds = timelineRef.current.getBoundingClientRect();
    const x = clientX - bounds.left;
    const frame = animation.range.start + x / pxPerFrame;
    const snapped = animation.snapping ? Math.round(frame) : frame;
    setPlayhead(snapped);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingPlayhead) {
        scrubTo(e.clientX);
      }
      if (draggingSeg) {
        if (!timelineRef.current) return;
        const bounds = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - bounds.left;
        const frame = animation.range.start + x / pxPerFrame - (draggingSeg?.startOffset ?? 0);
        const duration = draggingSeg?.duration ?? 0;
        const clampedStart = Math.max(animation.range.start, Math.min(animation.range.end - duration, frame));
        const segRow = rows.find((r) => r.seg.id === draggingSeg?.segId);
        if (segRow) updateSegment(segRow.seg.targetId, segRow.seg.id, { start: clampedStart, end: clampedStart + duration });
      }
    };
    const onUp = () => {
      setDraggingKf(null);
      setDraggingPlayhead(false);
      setDraggingSeg(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingPlayhead, draggingSeg, pxPerFrame, animation.range.start, animation.range.end, rows, updateSegment]);

  useEffect(() => {
    const close = () => setKfMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const renderKeyframe = (trackId: string, kfId: string, frame: number) => {
    const x = (frame - animation.range.start) * pxPerFrame;
    const selected = animation.selectedKeyframeId === kfId;
    return (
      <div
        key={kfId}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          setDraggingKf({ id: kfId, trackId });
          selectKeyframe(kfId);
        }}
        onDoubleClick={() => moveKeyframe(kfId, Math.round(animation.playhead))}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          selectKeyframe(kfId);
          setKfMenu({ id: kfId, x: e.clientX, y: e.clientY });
        }}
        style={{
          position: "absolute",
          left: x - 6,
          top: 10,
          width: 12,
          height: 12,
          background: selected ? "var(--accent)" : "#cbd5e1",
          transform: "rotate(45deg)",
          cursor: "grab",
        }}
      />
    );
  };

  useEffect(() => {
    if (!draggingKf) return;
    const onMove = (e: MouseEvent) => {
      if (!draggingKf) return;
      if (!timelineRef.current) return;
      const bounds = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - bounds.left;
      const frame = animation.range.start + x / pxPerFrame;
      moveKeyframe(draggingKf.id, animation.snapping ? Math.round(frame) : frame);
    };
    const onUp = () => setDraggingKf(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [animation.range.start, animation.snapping, draggingKf, moveKeyframe, pxPerFrame]);

  const handleTriggerToggle = (targetId: string, segmentId: string, type: TriggerType, enabled: boolean) => {
    const seq = animation.sequences.find((s) => s.targetId === targetId);
    const seg = seq ? normalizeSequence(seq).segments.find((s) => s.id === segmentId) : null;
    const current = seg?.triggers ?? [];
    const exists = current.find((t) => t.type === type);
    let next = current;
    if (enabled && !exists) {
      const defaultOptions: Record<string, number | string | boolean> = { target: "self" };
      if (type === "delay") defaultOptions.delayMs = 300;
      if (type === "scroll") defaultOptions.axis = "y";
      if (type === "state") defaultOptions.state = "State";
      next = [...current, { id: `trg_${crypto.randomUUID()}`, type, options: defaultOptions }];
    }
    if (!enabled && exists) {
      next = current.filter((t) => t.type !== type);
    }
    setSequenceTriggers(targetId, segmentId, next);
  };

  const updateTriggerOption = (
    targetId: string,
    segmentId: string,
    triggerId: string,
    key: string,
    value: string | number | boolean
  ) => {
    const seq = animation.sequences.find((s) => s.targetId === targetId);
    const current = seq ? normalizeSequence(seq).segments.find((s) => s.id === segmentId)?.triggers ?? [] : [];
    setSequenceTriggers(
      targetId,
      segmentId,
      current.map((t) => (t.id === triggerId ? { ...t, options: { ...(t.options ?? {}), [key]: value } } : t))
    );
  };

  return (
    <div
      ref={hostRef}
      style={{
        height,
        borderTop: "1px solid var(--border)",
        background: "var(--panel-strong)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        onPointerDown={(e) => {
          const startY = e.clientY;
          const startH = height;
          const onMove = (ev: PointerEvent) => {
            setHeight(Math.max(180, startH - (ev.clientY - startY)));
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        style={{ height: 6, cursor: "ns-resize", background: "var(--panel)" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px" }}>
        <button
          onClick={() => (animation.playing ? pause() : play())}
          style={toolbarBtn}
          title={animation.playing ? "Pause" : "Play"}
        >
          {animation.playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={stop} style={toolbarBtn} title="Stop">
          <Square size={14} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span>FPS</span>
          <input
            type="number"
            min={1}
            max={240}
            value={animation.fps}
            onChange={(e) => setTimelineFps(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span>Range</span>
          <input
            type="number"
            value={Math.round(animation.range.start)}
            onChange={(e) => setTimelineRange({ start: Number(e.target.value), end: animation.range.end })}
            style={{ ...inputStyle, width: 70 }}
          />
          <span>→</span>
          <input
            type="number"
            value={Math.round(animation.range.end)}
            onChange={(e) => setTimelineRange({ start: animation.range.start, end: Number(e.target.value) })}
            style={{ ...inputStyle, width: 70 }}
          />
          <span style={{ marginLeft: 12, color: "var(--text-muted)" }}>Duration</span>
          <input
            type="number"
            value={Math.round(animation.duration)}
            onChange={(e) => setTimelineDuration(Number(e.target.value))}
            style={{ ...inputStyle, width: 70 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span>Frame</span>
          <input
            type="number"
            value={Math.round(animation.playhead)}
            onChange={(e) => setPlayhead(Number(e.target.value))}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <button onClick={() => setTimelineZoom(animation.zoom * 0.9)} style={toolbarBtn} title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => setTimelineZoom(animation.zoom * 1.1)} style={toolbarBtn} title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button onClick={toggleSnapping} style={{ ...toolbarBtn, background: animation.snapping ? "var(--selection)" : "var(--control)" }}>
            Snap
          </button>
          <button onClick={toggleLoop} style={{ ...toolbarBtn, background: animation.loop ? "var(--selection)" : "var(--control)" }}>
            Loop
          </button>
          <button
            onClick={toggleAutoKeyframe}
            style={{ ...toolbarBtn, background: animation.autoKeyframe ? "var(--selection)" : "var(--control)" }}
            title="Auto-keyframe"
          >
            Auto
          </button>
          <button onClick={() => addMarker(Math.round(animation.playhead))} style={toolbarBtn} title="Add marker">
            <Flag size={14} />
          </button>
          <button onClick={() => setTimelineOpen(false)} style={toolbarBtn} title="Close timeline">
            ✕
          </button>
        </div>
      </div>

      {animation.markers.length ? (
        <div style={{ padding: "0 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {animation.markers.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 10,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <span>{m.label || "Marker"}</span>
              <span style={{ color: "var(--text-muted)" }}>{Math.round(m.frame)}</span>
              <button onClick={() => removeMarker(m.id)} style={{ ...toolbarBtn, width: 22, height: 22 }}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {animation.lastWarning ? (
        <div style={{ padding: "0 12px", color: "#f97316", fontSize: 12 }}>{animation.lastWarning}</div>
      ) : null}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ width: 320, borderRight: "1px solid var(--border)", padding: 8, overflow: "auto" }}>
          {rows.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Right-click a layer → Animate to add tracks.</div> : null}
          {rows.map((row, idx) => {
            const bounds = { start: Math.round(row.seg.start), end: Math.round(row.seg.end) };
            const layout = rowLayouts.layouts.find((l) => l.segId === row.seg.id)!;
            const color = colorForSeg(row.seg.id);
            return (
              <div key={row.seg.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => updateSegment(row.seg.targetId, row.seg.id, { collapsed: !row.seg.collapsed })}
                        style={{ ...toolbarBtn, width: 26 }}
                      >
                        {row.seg.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <div style={{ width: 10, height: 10, borderRadius: 50, background: color }} />
                      <input
                        value={row.seg.name}
                        onChange={(e) => updateSegment(row.seg.targetId, row.seg.id, { name: e.target.value })}
                        style={{ ...inputStyle, height: 26, flex: 1 }}
                      />
                      <button
                        onClick={() => deleteSegment(row.seg.targetId, row.seg.id)}
                        style={{ ...toolbarBtn, width: 26 }}
                        title="Delete segment"
                      >
                        ×
                      </button>
                    </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--text-muted)" }}>{row.seqName}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {bounds.start} → {bounds.end} ({Math.max(0, bounds.end - bounds.start)}f)
                  </span>
                  <button
                    onClick={() => updateSegment(row.seg.targetId, row.seg.id, { loop: !row.seg.loop })}
                    style={{ ...toolbarBtn, background: row.seg.loop ? color : "var(--control)", color: row.seg.loop ? "#0b0b0b" : "var(--text)" }}
                    title="Loop"
                  >
                    <Repeat size={12} />
                  </button>
                  <button
                    onClick={() => updateSegment(row.seg.targetId, row.seg.id, { repeatable: row.seg.repeatable === false ? true : !row.seg.repeatable })}
                    style={{
                      ...toolbarBtn,
                      background: row.seg.repeatable !== false ? color : "var(--control)",
                      color: row.seg.repeatable !== false ? "#0b0b0b" : "var(--text)",
                    }}
                    title="Repeat on trigger"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    Easing
                    <select
                      value={(row.seg.easing as any) ?? "linear"}
                      onChange={(e) => updateSegment(row.seg.targetId, row.seg.id, { easing: e.target.value as any })}
                      style={{ ...inputStyle, width: 120, height: 26 }}
                    >
                      {["linear", "ease", "ease-in", "ease-out", "ease-in-out"].map((k) => (
                        <option key={k} value={k === "ease" ? "ease-in-out" : k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!row.seg.collapsed && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {PROPERTY_LABELS.map((prop) => (
                        <button
                          key={prop.id}
                          onClick={() => addKeyframeAtPlayhead(row.seg.targetId, prop.id, row.seg.id)}
                          style={{
                            ...pillStyle,
                            background: row.seg.tracks.some((t: any) => t.property === prop.id) ? color : "var(--control)",
                            color: row.seg.tracks.some((t: any) => t.property === prop.id) ? "#0b0b0b" : "var(--text)",
                          }}
                        >
                          {prop.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {TRIGGER_TYPES.map((t) => {
                        const enabled = row.seg.triggers.some((tr: any) => tr.type === t);
                        return (
                          <button
                            key={t}
                            onClick={() => handleTriggerToggle(row.seg.targetId, row.seg.id, t, !enabled)}
                            style={{ ...pillStyle, background: enabled ? color : "var(--control)", color: enabled ? "#0b0b0b" : "var(--text)" }}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    {row.seg.triggers.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--surface-subtle)", borderRadius: 8, padding: 6 }}>
                        {row.seg.triggers.map((tr: any) => (
                          <div key={tr.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, minWidth: 60 }}>{tr.type}</div>
                            <select
                              value={(tr.options?.target as string) ?? "self"}
                              onChange={(e) => updateTriggerOption(row.seg.targetId, row.seg.id, tr.id, "target", e.target.value)}
                              style={{ ...inputStyle, width: 110, height: 26 }}
                            >
                              <option value="self">Self</option>
                              <option value="other">Other</option>
                            </select>
                            {((tr.options?.target as string) ?? "self") === "other" ? (
                              <select
                                value={(tr.options?.targetId as string) ?? row.seg.targetId}
                                onChange={(e) => updateTriggerOption(row.seg.targetId, row.seg.id, tr.id, "targetId", e.target.value)}
                                style={{ ...inputStyle, width: 150, height: 26 }}
                              >
                                {layerOptions.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {tr.type === "delay" ? (
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                Delay (ms)
                                <input
                                  type="number"
                                  min={0}
                                  value={(tr.options?.delayMs as number) ?? 0}
                                  onChange={(e) => updateTriggerOption(row.seg.targetId, row.seg.id, tr.id, "delayMs", Number(e.target.value))}
                                  style={{ ...inputStyle, width: 80 }}
                                />
                              </label>
                            ) : null}
                            {tr.type === "scroll" ? (
                              <select
                                value={(tr.options?.axis as string) ?? "y"}
                                onChange={(e) => updateTriggerOption(row.seg.targetId, row.seg.id, tr.id, "axis", e.target.value)}
                                style={{ ...inputStyle, width: 80, height: 26 }}
                              >
                                <option value="y">Vertical</option>
                                <option value="x">Horizontal</option>
                              </select>
                            ) : null}
                            {tr.type === "state" ? (
                              <input
                                type="text"
                                placeholder="State name"
                                value={(tr.options?.state as string) ?? ""}
                                onChange={(e) => updateTriggerOption(row.seg.targetId, row.seg.id, tr.id, "state", e.target.value)}
                                style={{ ...inputStyle, width: 160 }}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1, position: "relative", overflow: "auto" }} ref={timelineRef} onDoubleClick={(e) => scrubTo(e.clientX)}>
          <div
            style={{ position: "relative", minWidth: timelineWidth, height: Math.max(rowLayouts.total, 400) }}
            onPointerDown={(e) => {
              setDraggingPlayhead(true);
              scrubTo(e.clientX);
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundSize: `${pxPerFrame * 10}px 100%`,
                backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)",
              }}
            />
            {animation.markers.map((m) => {
              const x = (m.frame - animation.range.start) * pxPerFrame;
              return (
                <div key={m.id} style={{ position: "absolute", left: x, top: 0, bottom: 0, width: 1, background: "#f59e0b" }} />
              );
            })}

            {rows.map((row, rowIdx) => {
              const layout = rowLayouts.layouts.find((l) => l.segId === row.seg.id)!;
              const segStartX = (row.seg.start - animation.range.start) * pxPerFrame;
              const segEndX = (row.seg.end - animation.range.start) * pxPerFrame;
              const width = Math.max(20, segEndX - segStartX);
              const color = colorForSeg(row.seg.id);
              return (
                <div key={row.seg.id} style={{ position: "absolute", left: 0, right: 0, top: layout.top, height: layout.height, borderBottom: "1px solid var(--border)" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: segStartX,
                      top: 8,
                      height: 18,
                      width,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: color,
                      opacity: 0.85,
                      cursor: "grab",
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (!timelineRef.current) return;
                      const bounds = timelineRef.current.getBoundingClientRect();
                      const x = e.clientX - bounds.left;
                      const frameAtPointer = animation.range.start + x / pxPerFrame;
                      setDraggingSeg({ segId: row.seg.id, startOffset: frameAtPointer - row.seg.start, duration: row.seg.end - row.seg.start });
                    }}
                    title={`${row.seg.name} (${Math.round(row.seg.start)}→${Math.round(row.seg.end)})`}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: segStartX + 6,
                      top: 8,
                      height: 18,
                      maxWidth: Math.max(40, width - 12),
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 11,
                      color: "#0b0b0b",
                      pointerEvents: "none",
                    }}
                  >
                    {row.seg.name.slice(0, 16)}
                  </div>
                  {!row.seg.collapsed &&
                    row.seg.tracks.map((track: any, idx: number) => (
                      <div key={track.id} style={{ position: "relative", height: 24, top: 28 + idx * 24 }}>
                        {track.keyframes.map((kf: any) => renderKeyframe(track.id, kf.id, kf.frame))}
                      </div>
                    ))}
                </div>
              );
            })}

            <div
              style={{
                position: "absolute",
                left: (animation.playhead - animation.range.start) * pxPerFrame,
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      </div>
      {kfMenu && (
        <div
          style={{
            position: "fixed",
            left: kfMenu.x,
            top: kfMenu.y,
            background: "var(--panel-strong)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 9999,
            minWidth: 160,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            style={menuBtn}
            onClick={() => {
              updateKeyframeEasing(kfMenu.id, { easeIn: "ease-in", easeOut: "linear" });
              setKfMenu(null);
            }}
          >
            Ease In
          </button>
          <button
            style={menuBtn}
            onClick={() => {
              updateKeyframeEasing(kfMenu.id, { easeOut: "ease-out", easeIn: "linear" });
              setKfMenu(null);
            }}
          >
            Ease Out
          </button>
          <button
            style={menuBtn}
            onClick={() => {
              updateKeyframeEasing(kfMenu.id, { easeIn: "ease-in-out" });
              setKfMenu(null);
            }}
          >
            Easy Ease In
          </button>
          <button
            style={menuBtn}
            onClick={() => {
              updateKeyframeEasing(kfMenu.id, { easeOut: "ease-in-out" });
              setKfMenu(null);
            }}
          >
            Easy Ease Out
          </button>
          <button
            style={menuBtn}
            onClick={() => {
              updateKeyframeEasing(kfMenu.id, { easeIn: "linear", easeOut: "linear" });
              setKfMenu(null);
            }}
          >
            Linear
          </button>
        </div>
      )}
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  height: 28,
  minWidth: 28,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--control)",
  color: "var(--text)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  padding: "0 8px",
};

const pillStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--control)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--control)",
  color: "var(--text)",
  padding: "0 8px",
};

const menuBtn: React.CSSProperties = {
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--control)",
  color: "var(--text)",
  cursor: "pointer",
  padding: "0 10px",
  textAlign: "left",
};
