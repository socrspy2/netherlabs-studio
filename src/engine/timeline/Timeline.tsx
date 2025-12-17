import React from "react";

export function Timeline({
  current,
  max,
  onSelect,
}: {
  current: number;
  max: number;
  onSelect: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: 10 }}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onSelect(n)}
          style={{
            minWidth: 42,
            height: 36,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.45)",
            background: n === current ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
            cursor: "pointer",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
