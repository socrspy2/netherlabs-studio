import React from "react";
import {
  MousePointer2,
  Frame,
  Square,
  Circle,
  Minus,
  Type,
  PenTool,
  Hand,
  ZoomIn,
  Undo2,
  Redo2,
  PanelTop,
  Play,
  X,
} from "lucide-react";
import { useEditor } from "../state/editorStore";
import { ToolId } from "../state/types";
import { useTheme } from "../state/themeStore";

const toolIcons: Record<ToolId, React.ReactNode> = {
  select: <MousePointer2 size={16} />,
  frame: <Frame size={16} />,
  rectangle: <Square size={16} />,
  ellipse: <Circle size={16} />,
  line: <Minus size={16} />,
  text: <Type size={16} />,
  pen: <PenTool size={16} />,
  hand: <Hand size={16} />,
  zoom: <ZoomIn size={16} />,
};

const toolOrder: ToolId[] = ["select", "frame", "rectangle", "ellipse", "line", "text", "pen", "hand", "zoom"];

export function TopBar() {
  const { doc, setTool, undo, redo, preview, setPreview } = useEditor();
  const { themeId, setThemeId, options } = useTheme();
  const [supportOpen, setSupportOpen] = React.useState(false);

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "var(--panel)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
        <div
          style={{
            height: 34,
            width: 34,
            borderRadius: 10,
            background: "linear-gradient(135deg,var(--badge-from),var(--badge-to))",
            display: "grid",
            placeItems: "center",
            color: "var(--badge-text)",
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
              background: doc.tool === tool ? "var(--selection)" : "transparent",
              border: "1px solid var(--border)",
              color: "var(--text)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Theme</label>
          <select
            value={themeId}
            onChange={(e) => setThemeId(e.target.value as any)}
            style={{
              height: 32,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--control)",
              color: "var(--text)",
              padding: "0 10px",
            }}
          >
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setSupportOpen(true)}
          style={{
            height: 34,
            padding: "0 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "linear-gradient(135deg,var(--accent),var(--accent-strong))",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Donate
        </button>

        <button
          onClick={() => setPreview(!preview)}
          style={iconBtnStyle}
          title={preview ? "Exit Preview" : "Preview"}
        >
          {preview ? <X size={16} /> : <Play size={16} />}
        </button>
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
            background: "var(--surface)",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border)",
          }}
        >
          <PanelTop size={16} />
          <div style={{ fontSize: 12, opacity: 0.8 }}>Draft workspace</div>
        </div>
      </div>

      {supportOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 20,
            padding: 16,
          }}
        >
          <div
            style={{
              maxWidth: 560,
              width: "100%",
              background: "var(--panel-strong)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              boxShadow: "0 20px 80px rgba(0,0,0,0.35)",
              padding: 20,
              color: "var(--text)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: 12,
                  background: "linear-gradient(135deg,var(--badge-from),var(--badge-to))",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--badge-text)",
                  fontWeight: 800,
                }}
              >
                ❤
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Support the Future of Vector Studio</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Every donation keeps Netherlabs open and accessible.</div>
              </div>
            </div>

            {["We’re passionate about continuously improving Vector Studio and building tools that are accessible to everyone. Netherlabs is an open-source startup, and our mission is simple: all of our apps — including Vector Studio — will remain free to use, without paywalls or locked features.",
            "Your donation directly supports ongoing development and helps us maintain the servers and infrastructure that keep everything running smoothly. As the platform grows, we plan to use advanced databases and services that come with significant costs, but we are committed to never restricting core functionality behind payments.",
            "The only optional paid features we may introduce in the future are things like extended storage, profile cosmetics, and themes — never essential tools.",
            "If you believe in open software, transparency, and building powerful tools for everyone, your support truly makes a difference. ❤️"].map((p, idx) => (
              <p key={idx} style={{ margin: "0 0 10px", lineHeight: 1.6, color: "var(--text)" }}>
                {p}
              </p>
            ))}

            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={() => setSupportOpen(false)}
                style={{
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--control)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <a
                href="https://paypal.me/netherlabsfonds"
                target="_blank"
                rel="noreferrer"
                style={{
                  height: 36,
                  padding: "0 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "linear-gradient(135deg,var(--accent),var(--accent-strong))",
                  color: "#ffffff",
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-grid",
                  placeItems: "center",
                }}
              >
                Donate via PayPal
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  height: 34,
  width: 34,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--control-strong)",
  color: "var(--text)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};
