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
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({
    export: true,
  });

  const toggle = (id: string) => setCollapsed((s) => ({ ...s, [id]: !s[id] }));

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
        overflow: "auto",
        overscrollBehavior: "contain",
      }}
      onWheelCapture={(e) => e.stopPropagation()}
    >
          <div style={{ fontWeight: 700, fontSize: 14 }}>Inspector</div>
      {!shape && <div style={{ fontSize: 12, opacity: 0.7 }}>Select a layer to edit properties.</div>}

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

      {shape && (
        <>
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

          <Section title="Corners" open={!collapsed.corners} onToggle={() => toggle("corners")}>
            <Grid>
              <LabeledInput label="TL" type="number" value={shape.radius.tl} field="radius.tl" />
              <LabeledInput label="TR" type="number" value={shape.radius.tr} field="radius.tr" />
              <LabeledInput label="BR" type="number" value={shape.radius.br} field="radius.br" />
              <LabeledInput label="BL" type="number" value={shape.radius.bl} field="radius.bl" />
            </Grid>
          </Section>

          <Section title="Shadow" open={!collapsed.shadow} onToggle={() => toggle("shadow")}>
            <Grid>
              <LabeledInput label="X" type="number" value={shape.shadow?.x ?? 0} field="shadow.x" />
              <LabeledInput label="Y" type="number" value={shape.shadow?.y ?? 0} field="shadow.y" />
              <LabeledInput label="Blur" type="number" value={shape.shadow?.blur ?? 0} field="shadow.blur" />
              <LabeledInput label="Spread" type="number" value={shape.shadow?.spread ?? 0} field="shadow.spread" />
              <LabeledInput label="Color" type="color" value={shape.shadow?.color ?? "#000000"} field="shadow.color" />
              <LabeledInput label="Opacity" type="number" value={(shape.shadow?.opacity ?? 0) * 100} field="shadow.opacityPercent" />
            </Grid>
          </Section>

          <Section title="Effects" open={!collapsed.effects} onToggle={() => toggle("effects")}>
            <Grid>
              <LabeledInput label="Blur" type="number" value={shape.effects?.blur ?? 0} field="effects.blur" />
              <LabeledInput label="Backdrop blur" type="number" value={shape.effects?.backgroundBlur ?? 0} field="effects.backgroundBlur" />
            </Grid>
          </Section>

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

          {shape.type === "text" && (
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

          <Section title="Export" open={!collapsed.export} onToggle={() => toggle("export")}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Export pipeline comes next (SVG/PNG/JSON).</div>
          </Section>
        </>
      )}
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
      if (field === "textFill.opacityPercent") {
        parsed = parsed / 100;
        targetField = "textFill.opacity";
      }
    }
    updateShapeProps(selected, (prev) => applyPath(prev, targetField, parsed));
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
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
          padding: "0 8px",
        }}
      />
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
