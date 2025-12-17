import React from "react";
import {
  MousePointer2,
  Frame,
  Square,
  Circle,
  Minus,
  Type,
  Hand,
  ZoomIn,
  Undo2,
  Redo2,
  PanelTop,
} from "lucide-react";
import { useEditor } from "../state/editorStore";
import { ToolId } from "../state/types";

const toolIcons: Record<ToolId, React.ReactNode> = {
  select: <MousePointer2 size={16} />,
  frame: <Frame size={16} />,
  rectangle: <Square size={16} />,
  ellipse: <Circle size={16} />,
  line: <Minus size={16} />,
  text: <Type size={16} />,
  hand: <Hand size={16} />,
  zoom: <ZoomIn size={16} />,
};

const toolOrder: ToolId[] = ["select", "frame", "rectangle", "ellipse", "line", "text", "hand", "zoom"];

export function TopBar() {
  const { doc, setTool, undo, redo } = useEditor();

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "rgba(15,23,42,0.9)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
        <div
          style={{
            height: 34,
            width: 34,
            borderRadius: 10,
            background: "linear-gradient(135deg,#a78bfa,#38bdf8)",
            display: "grid",
            placeItems: "center",
            color: "#0f172a",
            fontWeight: 800,
          }}
        >
          NL
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Netherlabs Studio</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Design Surface</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 20 }}>
        {toolOrder.map((tool) => (
          <button
            key={tool}
            onClick={() => setTool(tool)}
            style={{
              height: 34,
              minWidth: 34,
              padding: "0 10px",
              borderRadius: 10,
              background: doc.tool === tool ? "rgba(148,163,184,0.25)" : "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
            title={tool}
          >
            {toolIcons[tool]}
            <span style={{ fontSize: 12, textTransform: "capitalize" }}>{tool}</span>
          </button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={undo}
          style={iconBtnStyle}
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={redo}
          style={iconBtnStyle}
          title="Redo (Shift+Ctrl/Cmd+Z)"
        >
          <Redo2 size={16} />
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.04)",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <PanelTop size={16} />
          <div style={{ fontSize: 12, opacity: 0.8 }}>Draft workspace</div>
        </div>
      </div>
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  height: 34,
  width: 34,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(148,163,184,0.14)",
  color: "#e2e8f0",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};
