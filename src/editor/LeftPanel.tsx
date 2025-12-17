import React, { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Unlock, Layers, Image, FileStack, Copy, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useEditor } from "../state/editorStore";
import { LayerNode } from "../state/types";

type Tab = "pages" | "layers" | "assets";

export function LeftPanel() {
  const [tab, setTab] = useState<Tab>("layers");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "pages", label: "Pages", icon: <FileStack size={14} /> },
    { id: "layers", label: "Layers", icon: <Layers size={14} /> },
    { id: "assets", label: "Assets", icon: <Image size={14} /> },
  ];

  return (
    <aside
      style={{
        borderRight: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(15,23,42,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, padding: 8, gap: 6 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              height: 36,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.08)",
              background: tab === t.id ? "rgba(148,163,184,0.2)" : "transparent",
              color: "#e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
            }}
          >
            {t.icon}
            <span style={{ fontSize: 12 }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {tab === "pages" && <PagesPanel />}
        {tab === "layers" && <LayersPanel />}
        {tab === "assets" && <AssetsPanel />}
      </div>
    </aside>
  );
}

function PagesPanel() {
  return (
    <div style={{ color: "#cbd5e1", fontSize: 13, opacity: 0.8 }}>
      Single page for now — multipage flows coming soon.
    </div>
  );
}

function AssetsPanel() {
  return (
    <div style={{ color: "#cbd5e1", fontSize: 13, opacity: 0.8 }}>
      Drop assets or components here later.
    </div>
  );
}

function LayersPanel() {
  const {
    doc,
    setSelection,
    toggleVisible,
    toggleLocked,
    renameLayer,
    duplicateSelection,
    deleteSelection,
    bring,
    groupSelected,
    ungroupSelected,
    moveLayer,
    makeMaskFromSelection,
    toggleMask,
  } =
    useEditor();
  const flatSelection = useMemo(() => new Set(doc.selection), [doc.selection]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={miniBtn} onClick={() => bring("front")} title="Bring to front">
          <ArrowUp size={14} />
        </button>
        <button style={miniBtn} onClick={() => bring("back")} title="Send to back">
          <ArrowDown size={14} />
        </button>
        <button style={miniBtn} onClick={duplicateSelection} title="Duplicate">
          <Copy size={14} />
        </button>
        <button style={miniBtn} onClick={deleteSelection} title="Delete">
          <Trash2 size={14} />
        </button>
        <button style={miniBtn} onClick={groupSelected} title="Group">
          G
        </button>
        <button style={miniBtn} onClick={ungroupSelected} title="Ungroup">
          U
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {doc.layers.map((node) => (
          <LayerItem
            key={node.id}
            node={node}
            depth={0}
            selectedIds={flatSelection}
            onSelect={(ids, additive) => setSelection(ids, additive)}
            onToggleVisible={toggleVisible}
            onToggleLock={toggleLocked}
            onRename={renameLayer}
            onContextMenu={(id, e) => {
              e.preventDefault();
              if (!flatSelection.has(id)) {
                setSelection([id], e.shiftKey);
              }
              setMenu({ id, x: e.clientX, y: e.clientY });
            }}
            onMoveLayer={moveLayer}
          />
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          actions={[
            { label: "Duplicate", onClick: () => duplicateSelection() },
            { label: "Delete", onClick: () => deleteSelection() },
            { label: "Bring to front", onClick: () => bring("front") },
            { label: "Send to back", onClick: () => bring("back") },
            { label: "Bring forward", onClick: () => bring("up") },
            { label: "Send backward", onClick: () => bring("down") },
            { label: "Group", onClick: () => groupSelected() },
            { label: "Ungroup", onClick: () => ungroupSelected() },
            { label: "Make Mask", onClick: () => makeMaskFromSelection() },
            { label: "Toggle Mask", onClick: () => toggleMask(menu.id) },
            { label: "Toggle visibility", onClick: () => toggleVisible(menu.id) },
            { label: "Toggle lock", onClick: () => toggleLocked(menu.id) },
          ]}
        />
      )}
    </div>
  );
}

function LayerItem({
  node,
  depth,
  selectedIds,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onRename,
  onContextMenu,
  onMoveLayer,
}: {
  node: LayerNode;
  depth: number;
  selectedIds: Set<string>;
  onSelect: (ids: string[], additive?: boolean) => void;
  onToggleVisible: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (id: string, e: React.MouseEvent) => void;
  onMoveLayer: (draggedId: string, targetId: string, position: "before" | "after") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => ("shape" in node ? node.shape.name : node.name));

  const label =
    "shape" in node
      ? `${node.shape.name} · ${node.shape.type}`
      : `${node.name} · ${node.mask?.enabled ? "mask group" : "group"}`;

  const handleSubmit = () => {
    onRename(node.id, value || label);
    setEditing(false);
  };
  const selected = selectedIds.has(node.id);

  return (
    <div>
      <div
        draggable
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: selected ? "rgba(148,163,184,0.2)" : "transparent",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "6px 8px",
          marginLeft: depth * 12,
        }}
        onClick={(e) => onSelect([node.id], e.shiftKey)}
        onDoubleClick={() => setEditing(true)}
        onContextMenu={(e) => onContextMenu(node.id, e)}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/plain");
          if (!draggedId || draggedId === node.id) return;
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
          onMoveLayer(draggedId, node.id, position);
        }}
      >
        <button
          style={miniBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible(node.id);
          }}
          title="Toggle visibility"
        >
          {"shape" in node
            ? node.shape.visible
              ? <Eye size={14} />
              : <EyeOff size={14} />
            : node.visible
              ? <Eye size={14} />
              : <EyeOff size={14} />}
        </button>
        <button
          style={miniBtn}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(node.id);
          }}
          title="Toggle lock"
        >
          {"shape" in node
            ? node.shape.locked
              ? <Lock size={14} />
              : <Unlock size={14} />
            : node.locked
              ? <Lock size={14} />
              : <Unlock size={14} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "#e2e8f0",
              padding: "6px 8px",
              fontSize: 12,
            }}
          />
        ) : (
          <div style={{ flex: 1, fontSize: 12, color: "#e2e8f0" }}>{label}</div>
        )}
      </div>

      {node.kind === "group"
        ? node.children.map((child) => (
            <LayerItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onToggleVisible={onToggleVisible}
              onToggleLock={onToggleLock}
              onRename={onRename}
              onContextMenu={onContextMenu}
              onMoveLayer={onMoveLayer}
            />
          ))
        : null}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  height: 28,
  width: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "#e2e8f0",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

function ContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: { label: string; onClick: () => void }[];
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onDown = () => onClose();
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        background: "rgba(15,23,42,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 1000,
        minWidth: 180,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => {
            a.onClick();
            onClose();
          }}
          style={{
            height: 32,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.04)",
            color: "#e2e8f0",
            cursor: "pointer",
            textAlign: "left",
            padding: "0 10px",
            fontSize: 12,
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
