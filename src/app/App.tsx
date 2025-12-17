import React, { useEffect, useMemo, useState } from "react";
import { PixiStage } from "../engine/PixiStage";
import { Timeline } from "../engine/timeline/Timeline";
import { startPlayback } from "../engine/timeline/playback";

export default function App() {
  const maxFrames = 60;
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(12);

  const [viewport, setViewport] = useState(() => {
    const pad = 32;
    const w = Math.min(window.innerWidth - pad * 2, 1100);
    const h = Math.min(window.innerHeight - 260, 680);
    return { w: Math.max(640, w), h: Math.max(420, h) };
  });

  useEffect(() => {
    const onResize = () => {
      const pad = 32;
      const w = Math.min(window.innerWidth - pad * 2, 1100);
      const h = Math.min(window.innerHeight - 260, 680);
      setViewport({ w: Math.max(640, w), h: Math.max(420, h) });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const stop = startPlayback({
      getCurrent: () => currentFrame,
      setCurrent: setCurrentFrame,
      maxFrames,
      fps,
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, fps, currentFrame]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(255,182,185,0.55), transparent 60%)," +
          "radial-gradient(900px 600px at 80% 20%, rgba(187,222,214,0.55), transparent 60%)," +
          "radial-gradient(900px 600px at 60% 90%, rgba(97,192,191,0.45), transparent 60%)," +
          "linear-gradient(180deg, rgba(248,252,251,1), rgba(245,235,235,1))",
        fontFamily: "system-ui",
        color: "#0b0f1a",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>
            Netherlabs Studio
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Pixi WebGL stage + Offscreen brush + IndexedDB frames
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setIsPlaying((v) => !v)}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {isPlaying ? "Stop" : "Play"}
          </button>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>FPS</span>
            <input
              type="range"
              min={1}
              max={30}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
            />
            <span style={{ width: 28, fontSize: 12 }}>{fps}</span>
          </label>
        </div>
      </header>

      <main style={{ marginTop: 18 }}>
        <PixiStage
          width={viewport.w}
          height={viewport.h}
          currentFrame={currentFrame}
          setCurrentFrame={setCurrentFrame}
          maxFrames={maxFrames}
        />

        <div
          style={{
            marginTop: 14,
            borderRadius: 18,
            background: "rgba(255,255,255,0.45)",
            border: "1px solid rgba(255,255,255,0.35)",
            backdropFilter: "blur(14px)",
          }}
        >
          <Timeline current={currentFrame} max={maxFrames} onSelect={setCurrentFrame} />
        </div>
      </main>
    </div>
  );
}
