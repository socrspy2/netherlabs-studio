import React from "react";
import { useEditor } from "../../state/editorStore";
import { Shape, TextShape } from "../../state/types";

export function InspectorPanel() {
  const { doc } = useEditor();
  const selected = doc.selection[0];
  const flat = React.useMemo(() => flatten(doc.layers), [doc.layers]);
  const node = flat.find((n) => n.kind === "shape" && n.id === selected) as any;
  const shape: Shape | null = node?.shape ?? null;

  return (
    <aside
      style={{
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10,18,32,0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        padding: 14,
        gap: 12,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>Inspector</div>
      {!shape && <div style={{ fontSize: 12, opacity: 0.7 }}>Select a layer to edit properties.</div>}
      {shape && (
        <>
          <Section title="Layout">
            <Grid>
              <LabeledInput label="X" type="number" value={shape.x} field="x" />
              <LabeledInput label="Y" type="number" value={shape.y} field="y" />
              <LabeledInput label="W" type="number" value={shape.width} field="width" />
              <LabeledInput label="H" type="number" value={shape.height} field="height" />
              <LabeledInput label="Rotate" type="number" value={shape.rotation} field="rotation" />
              <LabeledInput label="Opacity" type="number" value={shape.opacity * 100} field="opacityPercent" />
            </Grid>
          </Section>

          <Section title="Fill">
            <ToggleRow field="fill.enabled" value={shape.fill.enabled} />
            <LabeledInput label="Color" type="color" value={shape.fill.color} field="fill.color" />
            <LabeledInput label="Alpha" type="number" value={shape.fill.opacity * 100} field="fill.opacityPercent" />
          </Section>

          <Section title="Stroke">
            <ToggleRow field="stroke.enabled" value={shape.stroke.enabled} />
            <Grid>
              <LabeledInput label="Color" type="color" value={shape.stroke.color} field="stroke.color" />
              <LabeledInput label="Width" type="number" value={shape.stroke.width} field="stroke.width" />
              <SelectRow label="Align" value={shape.stroke.align} field="stroke.align" options={["inside", "center", "outside"]} />
              <ToggleRow label="Dashed" field="stroke.dashed" value={shape.stroke.dashed} />
            </Grid>
          </Section>

          <Section title="Corners">
            <Grid>
              <LabeledInput label="TL" type="number" value={shape.radius.tl} field="radius.tl" />
              <LabeledInput label="TR" type="number" value={shape.radius.tr} field="radius.tr" />
              <LabeledInput label="BR" type="number" value={shape.radius.br} field="radius.br" />
              <LabeledInput label="BL" type="number" value={shape.radius.bl} field="radius.bl" />
            </Grid>
          </Section>

          <Section title="Shadow">
            <Grid>
              <LabeledInput label="X" type="number" value={shape.shadow?.x ?? 0} field="shadow.x" />
              <LabeledInput label="Y" type="number" value={shape.shadow?.y ?? 0} field="shadow.y" />
              <LabeledInput label="Blur" type="number" value={shape.shadow?.blur ?? 0} field="shadow.blur" />
              <LabeledInput label="Spread" type="number" value={shape.shadow?.spread ?? 0} field="shadow.spread" />
              <LabeledInput label="Color" type="color" value={shape.shadow?.color ?? "#000000"} field="shadow.color" />
              <LabeledInput label="Opacity" type="number" value={(shape.shadow?.opacity ?? 0) * 100} field="shadow.opacityPercent" />
            </Grid>
          </Section>

          {shape.type === "text" && (
            <Section title="Typography">
              <Grid>
                <LabeledInput label="Font" type="text" value={(shape as TextShape).font} field="font" />
                <LabeledInput label="Size" type="number" value={(shape as TextShape).fontSize} field="fontSize" />
                <LabeledInput label="Weight" type="number" value={(shape as TextShape).fontWeight} field="fontWeight" />
                <LabeledInput label="Line height" type="number" value={(shape as TextShape).lineHeight} field="lineHeight" />
                <SelectRow label="Align" value={(shape as TextShape).align} field="align" options={["left", "center", "right"]} />
                <LabeledInput label="Text" type="text" value={(shape as TextShape).text} field="text" />
                <LabeledInput label="Color" type="color" value={(shape as TextShape).textColor} field="textColor" />
              </Grid>
            </Section>
          )}
        </>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 10,
        background: "rgba(255,255,255,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>{children}</div>;
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
      "stroke.width",
      "radius.tl",
      "radius.tr",
      "radius.bl",
      "radius.br",
      "shadow.x",
      "shadow.y",
      "shadow.blur",
      "shadow.spread",
      "shadow.opacityPercent",
      "fontSize",
      "fontWeight",
      "lineHeight",
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
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.06)",
          color: "#e2e8f0",
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
        onChange={(e) => updateShapeProps(selected, (prev) => applyPath(prev, field, e.target.value))}
        style={{
          height: 32,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.06)",
          color: "#e2e8f0",
          padding: "0 8px",
        }}
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
