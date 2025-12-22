import React, { useEffect, useMemo, useState } from "react";
import {
  AlignCenter,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignEndVertical,
  Italic,
} from "lucide-react";
import { TextShape } from "../../state/types";
import { useEditor } from "../../state/editorStore";
import {
  FALLBACK_FONT_STACK,
  FONT_OPTIONS,
  ensureFontFamilyLoaded,
  findFontOption,
  normalizeFontName,
} from "./fonts";

type Bounds = { x: number; y: number; width: number; height: number } | null;

export function TextSettingsWidget({
  containerRef,
  selectionBounds,
  viewport,
  textShape,
  hidden,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectionBounds: Bounds;
  viewport: { pan: { x: number; y: number }; zoom: number };
  textShape: TextShape | null;
  hidden?: boolean;
}) {
  const { updateShapeProps } = useEditor();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const fontName = useMemo(() => (textShape ? normalizeFontName(textShape.font) : ""), [textShape]);
  const fontOption = useMemo(() => (fontName ? findFontOption(fontName) : null), [fontName]);
  const weightOptions = useMemo(() => {
    const base = fontOption?.weights ?? [300, 400, 500, 600, 700, 800, 900];
    const current = textShape?.fontWeight;
    if (current && !base.includes(current)) {
      return [current, ...base];
    }
    return base;
  }, [fontOption, textShape?.fontWeight]);

  useEffect(() => {
    if (!textShape || !selectionBounds || !containerRef.current) {
      setPosition(null);
      return;
    }
    const compute = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left =
        rect.left + viewport.pan.x + (selectionBounds.x + selectionBounds.width / 2) * viewport.zoom;
      const top = rect.top + viewport.pan.y + selectionBounds.y * viewport.zoom;
      setPosition({ left, top });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [
    containerRef,
    selectionBounds?.x,
    selectionBounds?.y,
    selectionBounds?.width,
    selectionBounds?.height,
    textShape?.id,
    viewport.pan.x,
    viewport.pan.y,
    viewport.zoom,
  ]);

  useEffect(() => {
    if (!textShape || !fontName) return;
    const weights = fontOption?.weights ?? [textShape.fontWeight || 400];
    ensureFontFamilyLoaded(fontName, weights).catch(() => {});
  }, [fontName, fontOption, textShape]);

  const textFill = (textShape as any)?.textFill ?? null;
  const colorValue =
    (textFill?.kind === "solid" ? textFill.color : textShape?.textColor) ??
    (textShape?.textColor || "#ffffff");
  const baseColor = normalizeHex(colorValue);
  const gradientStops = useMemo(() => {
    if (textFill?.kind === "linear" && Array.isArray(textFill.stops) && textFill.stops.length >= 2) {
      return textFill.stops.slice(0, 2);
    }
    return [
      { offset: 0, color: "#ffffff", opacity: 1 },
      { offset: 1, color: "#999999", opacity: 1 },
    ];
  }, [textFill]);

  if (!textShape || !selectionBounds || !position || hidden) return null;

  const setProps = (changes: Partial<TextShape>) => updateShapeProps(textShape.id, changes as any);

  const handleFontChange = (family: string) => {
    const option = findFontOption(family);
    const stack = option ? `${option.family}, ${FALLBACK_FONT_STACK}` : family;
    const nextWeight =
      option && !option.weights.includes(textShape.fontWeight) ? option.weights[0] : textShape.fontWeight;
    setProps({ font: stack, fontWeight: nextWeight });
  };

  const handleColorChange = (color: string) => {
    if (textFill?.kind === "solid") {
      setProps({ textFill: { ...textFill, color } as any });
      return;
    }
    setProps({ textFill: { enabled: true, kind: "solid", color, opacity: textFill?.opacity ?? 1 } as any });
  };

  const handleFillKindChange = (kind: "solid" | "linear") => {
    if (kind === "solid") {
      setProps({
        textFill: { enabled: true, kind: "solid", color: baseColor, opacity: textFill?.opacity ?? 1 } as any,
      });
    } else {
      setProps({
        textFill: {
          enabled: true,
          kind: "linear",
          angle: (textFill as any)?.angle ?? 90,
          stops: gradientStops,
        } as any,
      });
    }
  };

  const updateGradientStop = (index: number, color: string) => {
    const nextStops = gradientStops.map((s: any, i: number) => (i === index ? { ...s, color } : s));
    setProps({
      textFill: {
        enabled: true,
        kind: "linear",
        angle: (textFill as any)?.angle ?? 90,
        stops: nextStops,
      } as any,
    });
  };

  const controlStyle: React.CSSProperties = {
    height: 32,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--control)",
    color: "var(--text)",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        transform: "translate(-50%, -130%)",
        pointerEvents: "none",
        zIndex: 200,
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          background: "var(--panel-strong)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 10,
          boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
          minWidth: 420,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select
            value={fontOption?.family ?? fontName}
            onChange={(e) => handleFontChange(e.target.value)}
            style={{ ...controlStyle, minWidth: 160, paddingRight: 26 }}
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.family}>
                {opt.label}
              </option>
            ))}
            {!fontOption ? (
              <option value={fontName || textShape.font}>Custom: {fontName || textShape.font}</option>
            ) : null}
          </select>
          <select
            value={textShape.fontWeight}
            onChange={(e) => setProps({ fontWeight: Number(e.target.value) || textShape.fontWeight })}
            style={{ ...controlStyle, width: 90, paddingRight: 26 }}
          >
            {weightOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            step={1}
            value={textShape.fontSize}
            onChange={(e) => setProps({ fontSize: Number(e.target.value) || textShape.fontSize })}
            style={{ ...controlStyle, width: 76, padding: "0 8px" }}
            aria-label="Font size"
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
            <ToggleButton
              active={textShape.align === "left"}
              onClick={() => setProps({ align: "left" })}
              ariaLabel="Align left"
            >
              <AlignLeft size={14} />
            </ToggleButton>
            <ToggleButton
              active={textShape.align === "center"}
              onClick={() => setProps({ align: "center" })}
              ariaLabel="Align center"
            >
              <AlignCenter size={14} />
            </ToggleButton>
            <ToggleButton
              active={textShape.align === "right"}
              onClick={() => setProps({ align: "right" })}
              ariaLabel="Align right"
            >
              <AlignRight size={14} />
            </ToggleButton>
            <div style={{ width: 1, height: 24, background: "var(--border)" }} />
            <ToggleButton
              active={(textShape.verticalAlign ?? "top") === "top"}
              onClick={() => setProps({ verticalAlign: "top" })}
              ariaLabel="Align top"
            >
              <AlignStartVertical size={14} />
            </ToggleButton>
            <ToggleButton
              active={(textShape.verticalAlign ?? "top") === "middle"}
              onClick={() => setProps({ verticalAlign: "middle" })}
              ariaLabel="Align middle"
            >
              <AlignCenterVertical size={14} />
            </ToggleButton>
            <ToggleButton
              active={(textShape.verticalAlign ?? "top") === "bottom"}
              onClick={() => setProps({ verticalAlign: "bottom" })}
              ariaLabel="Align bottom"
            >
              <AlignEndVertical size={14} />
            </ToggleButton>
            <div style={{ width: 1, height: 24, background: "var(--border)" }} />
            <ToggleButton
              active={(textShape.fontStyle ?? "normal") === "italic"}
              onClick={() => setProps({ fontStyle: textShape.fontStyle === "italic" ? "normal" : "italic" })}
              ariaLabel="Toggle italic"
            >
              <Italic size={14} />
            </ToggleButton>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <LabeledControl label="Fill">
            <select
              value={textFill?.kind === "linear" ? "linear" : "solid"}
              onChange={(e) => handleFillKindChange(e.target.value as "solid" | "linear")}
              style={{ ...controlStyle, width: 100, paddingRight: 26 }}
            >
              <option value="solid">Solid</option>
              <option value="linear">Linear</option>
            </select>
          </LabeledControl>
          {textFill?.kind !== "linear" ? (
            <LabeledControl label="Color">
              <input
                type="color"
                value={baseColor}
                onChange={(e) => handleColorChange(e.target.value)}
                style={{ ...controlStyle, width: 60, padding: 0 }}
              />
            </LabeledControl>
          ) : (
            <>
              <LabeledControl label="Start">
                <input
                  type="color"
                  value={normalizeHex(gradientStops[0]?.color ?? "#ffffff")}
                  onChange={(e) => updateGradientStop(0, e.target.value)}
                  style={{ ...controlStyle, width: 60, padding: 0 }}
                />
              </LabeledControl>
              <LabeledControl label="End">
                <input
                  type="color"
                  value={normalizeHex(gradientStops[1]?.color ?? "#999999")}
                  onChange={(e) => updateGradientStop(1, e.target.value)}
                  style={{ ...controlStyle, width: 60, padding: 0 }}
                />
              </LabeledControl>
              <LabeledControl label="Angle">
                <input
                  type="number"
                  value={(textFill as any)?.angle ?? 90}
                  onChange={(e) =>
                    setProps({
                      textFill: {
                        enabled: true,
                        kind: "linear",
                        angle: Number(e.target.value) || 0,
                        stops: gradientStops,
                      } as any,
                    })
                  }
                  style={{ ...controlStyle, width: 80, padding: "0 8px" }}
                />
              </LabeledControl>
            </>
          )}
          <LabeledControl label="Line">
            <input
              type="number"
              step={0.05}
              min={0.5}
              value={textShape.lineHeight}
              onChange={(e) => setProps({ lineHeight: Number(e.target.value) || textShape.lineHeight })}
              style={{ ...controlStyle, width: 90, padding: "0 8px" }}
            />
          </LabeledControl>
          <LabeledControl label="Spacing">
            <input
              type="number"
              step={0.25}
              value={textShape.letterSpacing ?? 0}
              onChange={(e) => setProps({ letterSpacing: Number(e.target.value) || 0 })}
              style={{ ...controlStyle, width: 90, padding: "0 8px" }}
            />
          </LabeledControl>
          <LabeledControl label="Content">
            <textarea
              value={textShape.text}
              onChange={(e) => setProps({ text: e.target.value })}
              rows={1}
              style={{
                ...controlStyle,
                width: 220,
                minHeight: 64,
                resize: "vertical",
                padding: 8,
                fontSize: 12,
              }}
            />
          </LabeledControl>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        height: 30,
        width: 32,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: active ? "var(--selection)" : "var(--control)",
        color: "var(--text)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, opacity: 0.85 }}>
      <span style={{ minWidth: 48 }}>{label}</span>
      {children}
    </label>
  );
}

function normalizeHex(color: string) {
  if (!color) return "#ffffff";
  if (color.startsWith("#") && color.length === 9) {
    return `#${color.slice(1, 7)}`;
  }
  if (color.startsWith("rgba")) {
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const [r, g, b] = match[1].split(",").map((p) => Math.max(0, Math.min(255, Number(p.trim()) || 0)));
      const toHex = (v: number) => v.toString(16).padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }
  return color;
}
