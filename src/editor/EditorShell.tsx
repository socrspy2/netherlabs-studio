import React, { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { LeftPanel } from "./LeftPanel";
import { CanvasViewport } from "./canvas/CanvasViewport";
import { InspectorPanel } from "./inspector/InspectorPanel";
import { BottomBar } from "./BottomBar";
import { useEditor } from "../state/editorStore";

export function EditorShell() {
  const { undo, redo, moveSelection, deleteSelection, duplicateSelection, setTool } = useEditor();
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(360);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.shiftKey ? redo() : undo();
        e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        duplicateSelection();
        e.preventDefault();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelection();
        e.preventDefault();
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const delta = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowUp") moveSelection(0, -delta, true);
        if (e.key === "ArrowDown") moveSelection(0, delta, true);
        if (e.key === "ArrowLeft") moveSelection(-delta, 0, true);
        if (e.key === "ArrowRight") moveSelection(delta, 0, true);
        e.preventDefault();
      }
      if (e.key.toLowerCase() === "v") setTool("select");
      if (e.key.toLowerCase() === "r") setTool("rectangle");
      if (e.key.toLowerCase() === "o") setTool("ellipse");
      if (e.key.toLowerCase() === "t") setTool("text");
      if (e.key.toLowerCase() === "h") setTool("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection, duplicateSelection, moveSelection, redo, setTool, undo]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {!leftCollapsed && (
          <div style={{ width: leftWidth, minWidth: 240, maxWidth: 520 }}>
            <LeftPanel />
          </div>
        )}
        <ResizeHandle
          onDrag={(dx) => setLeftWidth((w) => clamp(w + dx, 240, 520))}
          onToggleCollapse={() => setLeftCollapsed((v) => !v)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CanvasViewport />
        </div>
        <ResizeHandle
          onDrag={(dx) => setRightWidth((w) => clamp(w - dx, 260, 560))}
          onToggleCollapse={() => setRightCollapsed((v) => !v)}
        />
        {!rightCollapsed && (
          <div style={{ width: rightWidth, minWidth: 260, maxWidth: 560 }}>
            <InspectorPanel />
          </div>
        )}
      </div>
      <BottomBar />
    </div>
  );
}

function ResizeHandle({ onDrag, onToggleCollapse }: { onDrag: (dx: number) => void; onToggleCollapse: () => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(dx);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={(e) => {
        dragging.current = true;
        lastX.current = e.clientX;
      }}
      onDoubleClick={onToggleCollapse}
      style={{
        width: 6,
        cursor: "col-resize",
        background: "rgba(255,255,255,0.03)",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    />
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
