import React from "react";
import { useEditor } from "../state/editorStore";
import { AlignHorizontalSpaceAround, MousePointer2, Hand, Keyboard } from "lucide-react";

export function BottomBar() {
  const { doc } = useEditor();
  return (
    <div
      style={{
        height: 38,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(15,23,42,0.92)",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 12,
        fontSize: 12,
        color: "#cbd5e1",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <MousePointer2 size={14} />
        <span>Select</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Hand size={14} />
        <span>Space to pan</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Keyboard size={14} />
        <span>Arrows nudge · Shift+Arrows = 10px</span>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <AlignHorizontalSpaceAround size={14} />
        <span>{Math.round(doc.viewport.zoom * 100)}%</span>
      </div>
    </div>
  );
}
