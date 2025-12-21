import React from "react";
import { useEditor } from "../../state/editorStore";
import { Shape, TextShape } from "../../state/types";

export function InspectorPanel() {
  const { doc, setCanvasBackground, setCanvasSize } = useEditor();
  const selected = doc.selection[0];
  const flat = React.useMemo(() => flatten(doc.layers), [doc.layers]);
  const node = flat.find((n) => n.kind === "shape" && n.id === selected) as any;
  const shape: Shape | null = node?.shape ?? null;
  const canvasSize = doc.canvasSize ?? { width: 1800, height: 1200 };
  const requiredSections = React.useMemo(() => new Set(["canvas", "layout", "fill", "stroke", "corners"]), []);
  const [hiddenSections, setHiddenSections] = React.useState<Set<string>>(() => new Set());
  const [sectionMenuOpen, setSectionMenuOpen] = React.useState(false);
  const sectionButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const sectionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({
    export: true,
  });

  const toggle = (id: string) => setCollapsed((s) => ({ ...s, [id]: !s[id] }));
  const toggleSectionVisibility = (id: string) => {
    if (requiredSections.has(id)) return;
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isSectionVisible = (id: string) => requiredSections.has(id) || !hiddenSections.has(id);

  const sectionOptions = React.useMemo(
    () => [
      { id: "canvas", label: "Canvas", required: true },
      { id: "layout", label: "Layout", required: true },
      { id: "fill", label: "Fill", required: true },
      { id: "stroke", label: "Stroke", required: true },
      { id: "corners", label: "Corners", required: true },
      { id: "dropShadow", label: "Drop Shadow" },
      { id: "glow", label: "Glow" },
      { id: "effects", label: "Effects" },
      { id: "blend", label: "Blend" },
      { id: "type", label: "Typography", hidden: shape?.type !== "text" },
      { id: "export", label: "Export" },
    ],
    [shape?.type]
  );
  const shadow = shape?.shadow ?? { enabled: true, x: 0, y: 4, blur: 12, spread: 0, color: "#000000", opacity: 0.16 };
  const glow = (shape as any)?.glow ?? {
    enabled: false,
    mode: "outer",
    color: "#4f46e5",
    opacity: 0.35,
    blur: 16,
    spread: 4,
    offset: { x: 0, y: 0 },
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSectionMenuOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!sectionMenuOpen) return;
      const target = e.target as Node;
      if (!sectionButtonRef.current?.contains(target) && !sectionMenuRef.current?.contains(target)) {
        setSectionMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [sectionMenuOpen]);

  return (
    <aside
      style={{
        borderLeft: "1px solid var(--border)",
        background: "var(--panel-strong)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        padding: 14,
        gap: 12,
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
        width: "100%",
      }}
      onWheelCapture={(e) => e.stopPropagation()}
    >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Inspector</div>
            <div style={{ position: "relative" }}>
              <button
                ref={sectionButtonRef}
                onClick={() => setSectionMenuOpen((v) => !v)}
                style={{
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--control)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Sections ▾
              </button>
              {sectionMenuOpen && (
                <div
                  ref={sectionMenuRef}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 32,
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
                    padding: 10,
                    minWidth: 200,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    zIndex: 10,
                  }}
                >
                  {sectionOptions
                    .filter((s) => !s.hidden)
                    .map((s) => (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          disabled={s.required}
                          checked={s.required || isSectionVisible(s.id)}
                          onChange={() => toggleSectionVisibility(s.id)}
                        />
                        <span style={{ opacity: s.required ? 0.7 : 1 }}>
                          {s.label}
                          {s.required ? " (required)" : ""}
                        </span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          </div>
          {!shape && <div style={{ fontSize: 12, opacity: 0.7 }}>Select a layer to edit properties.</div>}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 4, display: "flex", flexDirection: "column", gap: 12 }}>

      {isSectionVisible("canvas") && (
        <Section title="Canvas" open={!collapsed.canvas} onToggle={() => toggle("canvas")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Checker", bg: { kind: "checkerboard" as const } },
              { label: "White", bg: { kind: "preset" as const, value: "white" as const } },
              { label: "Black", bg: { kind: "preset" as const, value: "black" as const } },
              { label: "Blue", bg: { kind: "preset" as const, value: "blue" as const } },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => setCanvasBackground(p.bg)}
                style={{
                  height: 32,
                  padding: "0 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--control)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p.label}
              </button>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>Custom</span>
              <input
                type="color"
                value={doc.canvasBackground.kind === "custom" ? doc.canvasBackground.color : "#0b1224"}
                onChange={(e) => setCanvasBackground({ kind: "custom", color: e.target.value })}
                style={{
                  height: 32,
                  width: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--control)",
                }}
              />
            </label>
          </div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>Canvas background is for editing only (not export).</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <LabeledSizeInput
                label="Width"
                value={canvasSize.width}
                onChange={(next) => setCanvasSize({ ...canvasSize, width: next })}
              />
              <LabeledSizeInput
                label="Height"
                value={canvasSize.height}
                onChange={(next) => setCanvasSize({ ...canvasSize, height: next })}
              />
              <div style={{ fontSize: 11, opacity: 0.65 }}>px</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ label: "Web", width: 1440, height: 900 }, { label: "Tablet", width: 1024, height: 768 }, { label: "Phone", width: 390, height: 844 }].map((t) => (
                <button
                  key={t.label}
                  onClick={() => setCanvasSize({ width: t.width, height: t.height })}
                  style={{
                    height: 32,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--control)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {t.label} {t.width}×{t.height}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {shape && (
        <>
          {isSectionVisible("layout") && (
            <Section title="Layout" open={!collapsed.layout} onToggle={() => toggle("layout")}>
              <Grid>
                <LabeledInput label="X" type="number" value={shape.x} field="x" />
                <LabeledInput label="Y" type="number" value={shape.y} field="y" />
                <LabeledInput label="W" type="number" value={shape.width} field="width" />
                <LabeledInput label="H" type="number" value={shape.height} field="height" />
                <LabeledInput label="Rotate" type="number" value={shape.rotation} field="rotation" />
                <LabeledInput label="Opacity" type="number" value={shape.opacity * 100} field="opacityPercent" />
              </Grid>
            </Section>
          )}

          {isSectionVisible("fill") && (
            <Section title="Fill" open={!collapsed.fill} onToggle={() => toggle("fill")}>
              <ToggleRow field="fill.enabled" value={shape.fill.enabled} />
              <SelectRow
                label="Type"
                value={shape.fill.kind}
                field="fill.kind"
                options={["solid", "linear"]}
              />
              {shape.fill.kind === "solid" ? (
                <>
                  <LabeledInput label="Color" type="color" value={shape.fill.color} field="fill.color" />
                  <LabeledInput
                    label="Alpha"
                    type="number"
                    value={shape.fill.opacity * 100}
                    field="fill.opacityPercent"
                  />
                </>
              ) : (
                <>
                  <LabeledInput label="Angle" type="number" value={shape.fill.angle} field="fill.angle" />
                  <GradientStopsEditor field="fill.stops" stops={shape.fill.stops} />
                </>
              )}
            </Section>
          )}

          {isSectionVisible("stroke") && (
            <Section title="Stroke" open={!collapsed.stroke} onToggle={() => toggle("stroke")}>
              <ToggleRow field="stroke.enabled" value={shape.stroke.enabled} />
              <Grid>
                <SelectRow
                  label="Type"
                  value={shape.stroke.kind}
                  field="stroke.kind"
                  options={["solid", "linear"]}
                />
                {"kind" in shape.stroke && shape.stroke.kind === "solid" ? (
                  <LabeledInput label="Color" type="color" value={(shape.stroke as any).color} field="stroke.color" />
                ) : (
                  <>
                    <LabeledInput label="Angle" type="number" value={(shape.stroke as any).angle ?? 0} field="stroke.angle" />
                    <GradientStopsEditor field="stroke.stops" stops={(shape.stroke as any).stops ?? []} />
                  </>
                )}
                <LabeledInput label="Width" type="number" value={shape.stroke.width} field="stroke.width" />
                <SelectRow label="Align" value={shape.stroke.align} field="stroke.align" options={["inside", "center", "outside"]} />
                <ToggleRow label="Dashed" field="stroke.dashed" value={shape.stroke.dashed} />
              </Grid>
            </Section>
          )}

          {isSectionVisible("corners") && (
            <Section title="Corners" open={!collapsed.corners} onToggle={() => toggle("corners")}>
              <Grid>
                <LabeledInput label="TL" type="number" value={shape.radius.tl} field="radius.tl" />
                <LabeledInput label="TR" type="number" value={shape.radius.tr} field="radius.tr" />
                <LabeledInput label="BR" type="number" value={shape.radius.br} field="radius.br" />
                <LabeledInput label="BL" type="number" value={shape.radius.bl} field="radius.bl" />
              </Grid>
            </Section>
          )}

          {isSectionVisible("dropShadow") && (
            <Section title="Drop Shadow" open={!collapsed.dropShadow} onToggle={() => toggle("dropShadow")}>
              <ToggleRow label="Enabled" field="shadow.enabled" value={shadow.enabled !== false} />
              <Grid>
                <LabeledInput label="X" type="number" value={shadow.x ?? 0} field="shadow.x" />
                <LabeledInput label="Y" type="number" value={shadow.y ?? 0} field="shadow.y" />
                <LabeledInput label="Blur" type="number" value={shadow.blur ?? 0} field="shadow.blur" />
                <LabeledInput label="Spread" type="number" value={shadow.spread ?? 0} field="shadow.spread" />
                <LabeledInput label="Color" type="color" value={shadow.color ?? "#000000"} field="shadow.color" />
                <LabeledInput label="Opacity" type="number" value={(shadow.opacity ?? 0) * 100} field="shadow.opacityPercent" />
              </Grid>
            </Section>
          )}

          {isSectionVisible("glow") && (
            <Section title="Glow" open={!collapsed.glow} onToggle={() => toggle("glow")}>
              <ToggleRow label="Enabled" field="glow.enabled" value={glow.enabled ?? false} />
              <SelectRow label="Mode" value={glow.mode ?? "outer"} field="glow.mode" options={["outer", "inner"]} />
              <Grid>
                <LabeledInput label="Color" type="color" value={glow.color ?? "#4f46e5"} field="glow.color" />
                <LabeledInput label="Opacity" type="number" value={(glow.opacity ?? 0) * 100} field="glow.opacityPercent" />
                <LabeledInput label="Blur" type="number" value={glow.blur ?? 0} field="glow.blur" />
                <LabeledInput label="Spread" type="number" value={glow.spread ?? 0} field="glow.spread" />
                <LabeledInput label="Offset X" type="number" value={glow.offset?.x ?? 0} field="glow.offset.x" />
                <LabeledInput label="Offset Y" type="number" value={glow.offset?.y ?? 0} field="glow.offset.y" />
              </Grid>
            </Section>
          )}

          {isSectionVisible("effects") && (
            <Section title="Effects" open={!collapsed.effects} onToggle={() => toggle("effects")}>
              <Grid>
                <LabeledInput label="Blur" type="number" value={shape.effects?.blur ?? 0} field="effects.blur" />
                <LabeledInput label="Backdrop blur" type="number" value={shape.effects?.backgroundBlur ?? 0} field="effects.backgroundBlur" />
              </Grid>
            </Section>
          )}

          {isSectionVisible("blend") && (
            <Section title="Blend" open={!collapsed.blend} onToggle={() => toggle("blend")}>
              <SelectRow
                label="Mode"
                value={(shape.blendMode ?? "normal") as any}
                field="blendMode"
                options={[
                  "normal",
                  "multiply",
                  "screen",
                  "overlay",
                  "darken",
                  "lighten",
                  "color-dodge",
                  "color-burn",
                  "linear-dodge",
                  "linear-burn",
                  "hard-light",
                  "soft-light",
                  "difference",
                  "exclusion",
                  "hue",
                  "saturation",
                  "color",
                  "luminosity",
                  "add",
                  "subtract",
                  "divide",
                ]}
              />
            </Section>
          )}

          {shape.type === "text" && isSectionVisible("type") && (
            <Section title="Typography" open={!collapsed.type} onToggle={() => toggle("type")}>
              <Grid>
                {(() => {
                  const textShape = shape as TextShape;
                  const textFill = textShape.textFill ?? { enabled: true, kind: "solid", color: textShape.textColor, opacity: 1 };
                  return (
                    <>
                      <LabeledInput label="Font" type="text" value={textShape.font} field="font" />
                      <LabeledInput label="Size" type="number" value={textShape.fontSize} field="fontSize" />
                      <LabeledInput label="Weight" type="number" value={textShape.fontWeight} field="fontWeight" />
                      <LabeledInput label="Line height" type="number" value={textShape.lineHeight} field="lineHeight" />
                      <SelectRow label="Align" value={textShape.align} field="align" options={["left", "center", "right"]} />
                      <LabeledInput label="Text" type="text" value={textShape.text} field="text" />
                      <SelectRow
                        label="Fill"
                        value={textFill.kind}
                        field="textFill.kind"
                        options={["solid", "linear"]}
                      />
                      {textFill.kind !== "linear" ? (
                        <>
                          <LabeledInput label="Color" type="color" value={textFill.color} field="textFill.color" />
                          <LabeledInput label="Alpha" type="number" value={textFill.opacity * 100} field="textFill.opacityPercent" />
                        </>
                      ) : (
                        <>
                          <LabeledInput label="Angle" type="number" value={(textFill as any).angle ?? 0} field="textFill.angle" />
                          <GradientStopsEditor field="textFill.stops" stops={(textFill as any).stops ?? []} />
                        </>
                      )}
                    </>
                  );
                })()}
              </Grid>
            </Section>
          )}

          {isSectionVisible("export") && (
            <Section title="Export" open={!collapsed.export} onToggle={() => toggle("export")}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Export pipeline comes next (SVG/PNG/JSON).</div>
            </Section>
          )}
        </>
      )}
      </div>
    </aside>
  );
}

function Section({
  title,
  open = true,
  onToggle,
  children,
}: {
  title: string;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 10,
        background: "var(--surface-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "100%",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          height: 28,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--control)",
          color: "var(--text)",
          cursor: "pointer",
          textAlign: "left",
          padding: "0 10px",
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        {open ? "▾ " : "▸ "}
        {title}
      </button>
      {open ? children : null}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{children}</div>;
}

function LabeledSizeInput({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 120 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (!Number.isFinite(parsed)) return;
          onChange(Math.max(1, parsed));
        }}
        style={inputStyle}
      />
    </label>
  );
}

function LabeledInput({
  label,
  value,
  field,
  type,
}: {
  label: string;
  value: any;
  field: string;
  type: "text" | "number" | "color";
}) {
  const { updateShapeProps, doc } = useEditor();
  const selected = doc.selection[0];
  if (!selected) return null;

  const dragRef = React.useRef<{ startY: number; startValue: number; pointerId: number } | null>(null);

  const onChange = (val: string) => {
    const numericFields = [
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "opacityPercent",
      "fill.opacityPercent",
      "fill.angle",
      "stroke.width",
      "stroke.angle",
      "radius.tl",
      "radius.tr",
      "radius.bl",
      "radius.br",
      "shadow.x",
      "shadow.y",
      "shadow.blur",
      "shadow.spread",
      "shadow.opacityPercent",
      "glow.blur",
      "glow.spread",
      "glow.opacityPercent",
      "glow.offset.x",
      "glow.offset.y",
      "effects.blur",
      "effects.backgroundBlur",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "textFill.opacityPercent",
      "textFill.angle",
    ];
    const isNumeric = numericFields.includes(field);
    let parsed: any = val;
    let targetField = field;
    if (isNumeric) {
      parsed = Number(val);
      if (field === "opacityPercent") {
        parsed = parsed / 100;
        targetField = "opacity";
      }
      if (field === "fill.opacityPercent") {
        parsed = parsed / 100;
        targetField = "fill.opacity";
      }
      if (field === "shadow.opacityPercent") {
        parsed = parsed / 100;
        targetField = "shadow.opacity";
      }
      if (field === "glow.opacityPercent") {
        parsed = parsed / 100;
        targetField = "glow.opacity";
      }
      if (field === "textFill.opacityPercent") {
        parsed = parsed / 100;
        targetField = "textFill.opacity";
      }
      if (field === "rotation") {
        return updateShapeProps(selected, (prev) => {
          const next = applyPath(prev, targetField, parsed);
          return { ...next, matrix: undefined };
        });
      }
    }
    updateShapeProps(selected, (prev) => applyPath(prev, targetField, parsed));
  };

  React.useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const { startY, startValue } = dragRef.current;
      const delta = Math.round(startY - e.clientY);
      const next = startValue + delta;
      if (Number.isFinite(next)) {
        onChange(String(next));
      }
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onChange]);

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <div style={{ position: "relative" }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            height: 32,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--control)",
            color: "var(--text)",
            padding: "0 24px 0 8px",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {type === "number" ? (
          <div
            onPointerDown={(e) => {
              if (e.button === 0) {
                dragRef.current = { startY: e.clientY, startValue: Number(value) || 0, pointerId: e.pointerId };
                e.preventDefault();
              }
            }}
            style={{
              position: "absolute",
              right: 4,
              top: 4,
              bottom: 4,
              width: 16,
              borderRadius: 6,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "ns-resize",
              opacity: 0.6,
              fontSize: 10,
              userSelect: "none",
            }}
          >
            <span style={{ lineHeight: "10px" }}>▲</span>
            <span style={{ lineHeight: "10px" }}>▼</span>
          </div>
        ) : null}
      </div>
    </label>
  );
}

function ToggleRow({ label = "Enabled", field, value }: { label?: string; field: string; value: boolean }) {
  const { updateShapeProps, doc } = useEditor();
  const selected = doc.selection[0];
  if (!selected) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => updateShapeProps(selected, (prev) => applyPath(prev, field, e.target.checked))}
      />
      <span>{label}</span>
    </label>
  );
}

function SelectRow({
  label,
  value,
  field,
  options,
}: {
  label: string;
  value: string;
  field: string;
  options: string[];
}) {
  const { updateShapeProps, doc } = useEditor();
  const selected = doc.selection[0];
  if (!selected) return null;
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <select
        value={value}
        onChange={(e) =>
          updateShapeProps(selected, (prev) => {
            const nextValue = e.target.value;
            // Normalize fill/stroke/textFill when switching kinds so renderer never sees incomplete objects.
            if (field === "fill.kind") {
              return normalizeKind(prev, "fill", nextValue);
            }
            if (field === "stroke.kind") {
              return normalizeKind(prev, "stroke", nextValue);
            }
            if (field === "textFill.kind") {
              return normalizeKind(prev, "textFill", nextValue);
            }
            return applyPath(prev, field, nextValue);
          })
        }
        className="themed-select"
        style={{ height: 32 }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function flatten(nodes: any[]): any[] {
  const out: any[] = [];
  const walk = (list: any[]) => {
    for (const n of list) {
      out.push(n);
      if (n.kind === "group") walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function applyPath(shape: any, path: string, value: any) {
  const next = { ...shape };
  const parts = path.split(".");
  let cursor = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    cursor[key] = { ...(cursor[key] || {}) };
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

function normalizeKind(shape: any, key: "fill" | "stroke" | "textFill", kind: string) {
  const next = { ...shape };
  const current = next[key] || {};
  if (kind === "solid") {
    next[key] =
      key === "stroke"
        ? {
            ...current,
            enabled: current.enabled ?? true,
            kind: "solid",
            color: current.color ?? "#ffffff",
            opacity: current.opacity ?? 1,
            width: current.width ?? 2,
            align: current.align ?? "center",
            dashed: current.dashed ?? false,
          }
        : {
            ...current,
            enabled: current.enabled ?? true,
            kind: "solid",
            color: current.color ?? "#ffffff",
            opacity: current.opacity ?? 1,
          };
    return next;
  }
  next[key] =
    key === "stroke"
      ? {
          ...current,
          enabled: current.enabled ?? true,
          kind: "linear",
          angle: current.angle ?? 0,
          stops:
            current.stops?.length >= 2
              ? current.stops
              : [
                  { offset: 0, color: current.color ?? "#ffffff", opacity: current.opacity ?? 1 },
                  { offset: 1, color: "#000000", opacity: 1 },
                ],
          width: current.width ?? 2,
          align: current.align ?? "center",
          dashed: current.dashed ?? false,
          opacity: current.opacity ?? 1,
        }
      : {
          ...current,
          enabled: current.enabled ?? true,
          kind: "linear",
          angle: current.angle ?? 0,
          stops:
            current.stops?.length >= 2
              ? current.stops
              : [
                  { offset: 0, color: current.color ?? "#ffffff", opacity: current.opacity ?? 1 },
                  { offset: 1, color: "#000000", opacity: 1 },
                ],
        };
  return next;
}

function GradientStopsEditor({ field, stops }: { field: string; stops: any[] }) {
  const { doc, updateShapeProps } = useEditor();
  const selected = doc.selection[0];
  if (!selected) return null;

  const safeStops = stops?.length ? stops : [
    { offset: 0, color: "#ffffff", opacity: 1 },
    { offset: 1, color: "#000000", opacity: 1 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, gridColumn: "1 / -1" }}>
      {safeStops.slice(0, 4).map((s, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <span style={{ opacity: 0.7 }}>Stop {idx + 1}</span>
            <input
              type="color"
              value={s.color}
              onChange={(e) => {
                const nextStops = safeStops.map((st, i) => (i === idx ? { ...st, color: e.target.value } : st));
                updateShapeProps(selected, (prev) => applyPath(prev, field, nextStops));
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <span style={{ opacity: 0.7 }}>Opacity</span>
            <input
              type="number"
              value={Math.round((s.opacity ?? 1) * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                const nextStops = safeStops.map((st, i) => (i === idx ? { ...st, opacity: v } : st));
                updateShapeProps(selected, (prev) => applyPath(prev, field, nextStops));
              }}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
            <span style={{ opacity: 0.7 }}>Offset</span>
            <input
              type="number"
              value={Math.round((s.offset ?? 0) * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                const nextStops = safeStops.map((st, i) => (i === idx ? { ...st, offset: v } : st));
                updateShapeProps(selected, (prev) => applyPath(prev, field, nextStops));
              }}
              style={inputStyle}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--control)",
  color: "var(--text)",
  padding: "0 8px",
};
