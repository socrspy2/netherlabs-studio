import React, { useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { OffscreenSurface } from "./drawing/OffscreenSurface";
import { Brush } from "./drawing/Brush";
import { getFrameBlob, putFrameBlob } from "../storage/frameRepo";

function uuid() {
  return crypto.randomUUID();
}

type Props = {
  width: number;
  height: number;
  currentFrame: number;
  setCurrentFrame: (n: number) => void;
  maxFrames: number;
};

export function PixiStage({ width, height, currentFrame, maxFrames }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  // frameIndex -> blobId
  const [frames, setFrames] = useState<Record<number, string>>({});

  const surface = useMemo(() => new OffscreenSurface(width, height), [width, height]);
  const brush = useMemo(
    () => new Brush(surface.ctx, { baseSize: 18, color: "#0b0f1a", hardness: 1, opacity: 1 }),
    [surface]
  );

  // Pixi core refs
  const appRef = useRef<PIXI.Application | null>(null);
  const drawSpriteRef = useRef<PIXI.Sprite | null>(null);
  const onionSpriteRef = useRef<PIXI.Sprite | null>(null);

  // Create Pixi app once
  useEffect(() => {
    if (!hostRef.current) return;

    const app = new PIXI.Application();
    appRef.current = app;
    let cancelled = false;

    (async () => {
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (cancelled) {
        // Component unmounted before init completed
        app.destroy(true);
        return;
      }

      const host = hostRef.current;
      if (!host) return;

      host.innerHTML = "";
      host.appendChild(app.canvas);

      // onion skin sprite (behind)
      const onion = new PIXI.Sprite(PIXI.Texture.EMPTY);
      onion.alpha = 0.3;
      onion.visible = true;
      onionSpriteRef.current = onion;

      // main drawing sprite (front)
      const draw = new PIXI.Sprite(PIXI.Texture.EMPTY);
      drawSpriteRef.current = draw;

      // simple vector UI button (Pixi Graphics)
      const btn = new PIXI.Graphics()
        .roundRect(18, 18, 160, 44, 12)
        .fill({ color: 0xffffff, alpha: 0.9 });
      btn.eventMode = "static";
      btn.cursor = "pointer";

      const label = new PIXI.Text({
        text: "Export (later)",
        style: { fill: 0x0b0f1a, fontSize: 14, fontFamily: "system-ui" },
      });
      label.x = 34;
      label.y = 31;

      btn.on("pointertap", () => {
        alert("Export pipeline comes next: spritesheet + JSON atlas.");
      });

      app.stage.addChild(onion);
      app.stage.addChild(draw);
      app.stage.addChild(btn);
      app.stage.addChild(label);

      // initial draw from blank
      refreshDrawTextureFromSurface();

      // pointer input on Pixi canvas
      const canvas = app.canvas as HTMLCanvasElement;

      const toLocal = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
      };

      const onDown = (e: PointerEvent) => {
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        brush.pointerDown(x, y, e.pressure);
        refreshDrawTextureFromSurface();
      };

      const onMove = (e: PointerEvent) => {
        if (e.buttons === 0) return;
        const { x, y } = toLocal(e);
        brush.pointerMove(x, y, e.pressure);
        refreshDrawTextureFromSurface();
      };

      const onUp = async () => {
        brush.pointerUp();
        refreshDrawTextureFromSurface();

        // save current frame to IndexedDB as PNG blob
        const blob = await surface.toPngBlob();
        const id = uuid();
        await putFrameBlob(id, blob);
        setFrames((prev) => ({ ...prev, [currentFrame]: id }));
      };

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      return () => {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
      };
    })();

    return () => {
      cancelled = true;
      if (app.renderer) {
        app.destroy(true);
      } else {
        app.destroy();
      }
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handling
  useEffect(() => {
    surface.resize(width, height);
    if (appRef.current?.renderer) {
      appRef.current.renderer.resize(width, height);
      refreshDrawTextureFromSurface();
      refreshOnionTexture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // When switching frames: load blob into surface, update draw + onion
  useEffect(() => {
    (async () => {
      const blobId = frames[currentFrame];
      if (blobId) {
        const blob = await getFrameBlob(blobId);
        if (blob) await surface.drawBlob(blob);
      } else {
        surface.clear();
      }
      refreshDrawTextureFromSurface();
      await refreshOnionTexture();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrame, frames]);

  async function refreshOnionTexture() {
    const prevId = frames[currentFrame - 1];
    const onionSprite = onionSpriteRef.current;
    if (!onionSprite) return;

    if (!prevId) {
      onionSprite.texture = PIXI.Texture.EMPTY;
      return;
    }
    const blob = await getFrameBlob(prevId);
    if (!blob) return;

    const bmp = await createImageBitmap(blob);
    const tex = PIXI.Texture.from(bmp);
    onionSprite.texture = tex;
  }

  function refreshDrawTextureFromSurface() {
    const drawSprite = drawSpriteRef.current;
    if (!drawSprite) return;

    // Convert the offscreen canvas to a Pixi texture
    const tex = PIXI.Texture.from(surface.canvas);
    drawSprite.texture = tex;
  }

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(255,255,255,0.35)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.35)",
      }}
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          padding: "8px 10px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.75)",
          fontFamily: "system-ui",
          fontSize: 12,
        }}
      >
        Frame {currentFrame}/{maxFrames}
      </div>
    </div>
  );
}
