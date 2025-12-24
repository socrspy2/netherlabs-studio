import React, { useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { useEditor } from "../../state/editorStore";
import { useAssets } from "../../state/assetStore";
import { Asset, Fill, ImageShape, LayerNode, MediaFill, MediaFillMode, PathShape, Shape, Stroke, TextShape } from "../../state/types";
import { clampRange, ensureFiniteNumber } from "../../utils/numeric";

const DEFAULT_ARTBOARD = { width: 1800, height: 1200 };

export function PixiDocumentView() {
  const { resolvedDoc: doc } = useEditor();
  const { assetsById } = useAssets();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const rootRef = useRef<PIXI.Container | null>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const mountedRef = useRef(false);
  const [readyTick, setReadyTick] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const artboard = doc.canvasSize || DEFAULT_ARTBOARD;

  // init
  useEffect(() => {
    if (!hostRef.current) return;

    const host = hostRef.current;
    const app = new PIXI.Application();
    let disposed = false;
    let initialized = false;
    let ro: ResizeObserver | null = null;
    mountedRef.current = true;

    const safeRender = () => {
      if (disposed) return;
      try {
        app.render();
      } catch {
        // ignore
      }
    };

    const init = async () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);

      // Avoid Pixi's ResizePlugin and automatic ticker renders (React StrictMode can mount/unmount rapidly in dev).
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        autoStart: false,
        sharedTicker: false,
        resizeTo: null,
        preference: "webgl",
      } as any);
      initialized = true;

      if (disposed) {
        try {
          app.destroy({ removeView: true } as any, { children: true } as any);
        } catch {
          // ignore
        }
        return;
      }

      host.innerHTML = "";
      host.appendChild(app.canvas);
      appRef.current = app;

      const root = new PIXI.Container();
      rootRef.current = root;
      app.stage.addChild(root);

      const world = new PIXI.Container();
      worldRef.current = world;
      root.addChild(world);

      // Keep renderer size in sync with the host element.
      ro = new ResizeObserver(() => {
        if (disposed) return;
        const w = Math.max(1, host.clientWidth);
        const h = Math.max(1, host.clientHeight);
        try {
          app.renderer.resize(w, h);
          safeRender();
        } catch {
          // ignore
        }
      });
      ro.observe(host);

      setReadyTick((t) => t + 1);
      safeRender();
    };

    init().catch((err) => console.error("PixiDocumentView init failed", err));

    return () => {
      disposed = true;
      mountedRef.current = false;
      ro?.disconnect();
      ro = null;
      worldRef.current = null;
      rootRef.current = null;
      appRef.current = null;
      if (initialized) {
        try {
          app.destroy({ removeView: true } as any, { children: true } as any);
        } catch {
          // Pixi v8 can throw if a plugin was registered as `undefined` during HMR;
          // fall back to manual teardown to avoid crashing React effects.
          try {
            (app.stage as any)?.destroy?.({ children: true });
          } catch {
            // ignore
          }
          try {
            (app.renderer as any)?.destroy?.({ removeView: true });
          } catch {
            // ignore
          }
        }
      }
    };
  }, []);

  // viewport (pan+zoom)
  useEffect(() => {
    const root = rootRef.current;
    const app = appRef.current;
    if (!root) return;
    root.position.set(doc.viewport.pan.x, doc.viewport.pan.y);
    root.scale.set(doc.viewport.zoom);
    try {
      app?.render();
    } catch {
      // ignore
    }
  }, [doc.viewport.pan.x, doc.viewport.pan.y, doc.viewport.zoom, readyTick]);

  useEffect(() => {
    const fonts = (document as any).fonts;
    if (!fonts?.addEventListener) return;
    const pending = { value: false };
    const handleFontEvent = () => {
      if (pending.value) return;
      pending.value = true;
      requestAnimationFrame(() => {
        pending.value = false;
        const tm = (PIXI as any).CanvasTextMetrics?.CanvasTextMetrics ?? (PIXI as any).CanvasTextMetrics;
        if (tm?.clearCache) tm.clearCache();
        setReadyTick((t) => t + 1);
      });
    };
    fonts.addEventListener("loadingdone", handleFontEvent);
    fonts.addEventListener("loadingerror", handleFontEvent);
    return () => {
      fonts.removeEventListener("loadingdone", handleFontEvent);
      fonts.removeEventListener("loadingerror", handleFontEvent);
    };
  }, []);

  // render
  const flatLayers = useMemo(() => doc.layers, [doc.layers]);
  useEffect(() => {
    const world = worldRef.current;
    const app = appRef.current;
    if (!world || !app) return;

    const createdRenderTextures: PIXI.Texture[] = [];
    const idToDisplay = new Map<string, PIXI.Container>();

    world.removeChildren();
    try {
      renderNodes({
        nodes: flatLayers,
        parent: world,
        world,
        app,
        createdRenderTextures,
        idToDisplay,
        artboard,
        assets: assetsById,
        onTextureReady: () => setReadyTick((t) => t + 1),
      });
      setRenderError(null);
    } catch (err: any) {
      console.error("Render error", err);
      setRenderError(err?.message ?? "Render failed");
    }

    try {
      app.render();
    } catch {
      // ignore
    }

    return () => {
      createdRenderTextures.forEach((t) => t.destroy(true));
    };
  }, [assetsById, flatLayers, readyTick, artboard.height, artboard.width]);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      {renderError ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.9)",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            zIndex: 10,
            padding: 16,
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Canvas render error</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{renderError}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const textureCache = new Map<string, PIXI.Texture>();
const textureLoading = new Set<string>();
const warnedFields = new Set<string>();

function warnInvalid(field: string, value: any, shapeId?: string) {
  const key = shapeId ? `${field}:${shapeId}` : field;
  if (warnedFields.has(key)) return;
  warnedFields.add(key);
  console.warn(`[render] Recovered invalid ${field}`, { value, shapeId });
}

function sanitizeShape<T extends Shape>(shape: T): T {
  const clone = structuredClone(shape) as any as T;
  const shapeId = (shape as any).id;
  const safeNumber = (field: string, value: number | null | undefined, fallback = 0) => {
    if (!Number.isFinite(value)) {
      warnInvalid(field, value, shapeId);
      return fallback;
    }
    return value as number;
  };

  clone.x = safeNumber("x", shape.x, 0);
  clone.y = safeNumber("y", shape.y, 0);
  clone.width = Math.max(1, safeNumber("width", shape.width, 1));
  clone.height = Math.max(1, safeNumber("height", shape.height, 1));
  clone.rotation = safeNumber("rotation", shape.rotation, 0);
  clone.opacity = clampRange(safeNumber("opacity", shape.opacity, 1), 0, 1);
  if (clone.radius) {
    clone.radius = {
      tl: Math.max(0, safeNumber("radius.tl", (clone.radius as any).tl, 0)),
      tr: Math.max(0, safeNumber("radius.tr", (clone.radius as any).tr, 0)),
      br: Math.max(0, safeNumber("radius.br", (clone.radius as any).br, 0)),
      bl: Math.max(0, safeNumber("radius.bl", (clone.radius as any).bl, 0)),
    };
  }
  if (clone.stroke) {
    clone.stroke = sanitizeStroke(clone.stroke as Stroke);
  }
  if (clone.fill) {
    clone.fill = sanitizeFill(clone.fill as Fill);
  }
  if ((clone as any).shadow) {
    const shadow = (clone as any).shadow;
    (clone as any).shadow = {
      enabled: shadow.enabled !== false,
      x: safeNumber("shadow.x", shadow.x, 0),
      y: safeNumber("shadow.y", shadow.y, 0),
      blur: Math.max(0, safeNumber("shadow.blur", shadow.blur, 0)),
      spread: Math.max(0, safeNumber("shadow.spread", shadow.spread, 0)),
      color: shadow.color ?? "#000000",
      opacity: clampRange(safeNumber("shadow.opacity", shadow.opacity, 0.16), 0, 1),
      quality: shadow.quality ?? "medium",
    };
  }
  if ((clone as any).glow) {
    const glow = (clone as any).glow;
    (clone as any).glow = {
      enabled: glow.enabled ?? false,
      mode: glow.mode ?? "outer",
      color: glow.color ?? "#4f46e5",
      opacity: clampRange(safeNumber("glow.opacity", glow.opacity, 0.35), 0, 1),
      blur: Math.max(0, safeNumber("glow.blur", glow.blur, 0)),
      spread: Math.max(0, safeNumber("glow.spread", glow.spread, 0)),
      offset: {
        x: safeNumber("glow.offset.x", glow.offset?.x, 0),
        y: safeNumber("glow.offset.y", glow.offset?.y, 0),
      },
      quality: glow.quality ?? "medium",
    };
  }
  if ((clone as any).effects) {
    const effects = (clone as any).effects;
    (clone as any).effects = {
      blur: Math.max(0, safeNumber("effects.blur", effects.blur, 0)),
      backgroundBlur: Math.max(0, safeNumber("effects.backgroundBlur", effects.backgroundBlur, 0)),
    };
  }
  if (clone.type === "path") {
    const path = clone as any as PathShape;
    path.points = (path.points ?? []).map((pt, idx) => ({
      x: safeNumber(`path.point.${idx}.x`, pt.x, 0),
      y: safeNumber(`path.point.${idx}.y`, pt.y, 0),
      in: pt.in
        ? { x: safeNumber(`path.point.${idx}.in.x`, pt.in.x, pt.x), y: safeNumber(`path.point.${idx}.in.y`, pt.in.y, pt.y) }
        : null,
      out: pt.out
        ? { x: safeNumber(`path.point.${idx}.out.x`, pt.out.x, pt.x), y: safeNumber(`path.point.${idx}.out.y`, pt.out.y, pt.y) }
        : null,
      pointType: pt.pointType ?? "corner",
    }));
    path.closed = Boolean(path.closed);
  }
  if ((clone as any).fontSize !== undefined) {
    (clone as any).fontSize = Math.max(1, safeNumber("fontSize", (clone as any).fontSize, 16));
  }
  if ((clone as any).lineHeight !== undefined) {
    (clone as any).lineHeight = Math.max(0.1, safeNumber("lineHeight", (clone as any).lineHeight, 1.2));
  }
  if ((clone as any).fontWeight !== undefined) {
    (clone as any).fontWeight = Math.max(0, safeNumber("fontWeight", (clone as any).fontWeight, 400));
  }
  if ((clone as any).letterSpacing !== undefined) {
    (clone as any).letterSpacing = safeNumber("letterSpacing", (clone as any).letterSpacing, 0);
  }
  return clone as T;
}

function sanitizeFill(fill: Fill): Fill {
  if (fill.kind === "solid") {
    return {
      ...fill,
      opacity: clampRange(ensureFiniteNumber(fill.opacity, 1), 0, 1),
      color: fill.color ?? "#ffffff",
    };
  }
  if (fill.kind === "linear") {
    const stops = (fill.stops ?? []).map((s, idx) => ({
      offset: clampRange(ensureFiniteNumber(s.offset, 0), 0, 1),
      color: s.color ?? "#ffffff",
      opacity: clampRange(ensureFiniteNumber(s.opacity, 1), 0, 1),
    }));
    if (!stops.length) {
      stops.push({ offset: 0, color: "#ffffff", opacity: 1 }, { offset: 1, color: "#000000", opacity: 1 });
    }
    return {
      ...fill,
      angle: ensureFiniteNumber(fill.angle, 0),
      stops,
    };
  }
  const media = fill as MediaFill;
  return {
    ...media,
    scale: Math.max(0, ensureFiniteNumber(media.scale, 1)),
    offset: {
      x: ensureFiniteNumber(media.offset?.x, 0),
      y: ensureFiniteNumber(media.offset?.y, 0),
    },
    repeat: media.repeat ?? false,
  };
}

function sanitizeStroke(stroke: Stroke): Stroke {
  if ((stroke as any).kind === "solid") {
    const solid = stroke as any;
    return {
      ...solid,
      width: Math.max(0, ensureFiniteNumber(solid.width, 1)),
      opacity: clampRange(ensureFiniteNumber(solid.opacity, 1), 0, 1),
    };
  }
  const grad = stroke as any;
  const stops = (grad.stops ?? []).map((s: any) => ({
    offset: clampRange(ensureFiniteNumber(s.offset, 0), 0, 1),
    color: s.color ?? "#ffffff",
    opacity: clampRange(ensureFiniteNumber(s.opacity, 1), 0, 1),
  }));
  if (!stops.length) {
    stops.push({ offset: 0, color: "#ffffff", opacity: 1 }, { offset: 1, color: "#000000", opacity: 1 });
  }
  return {
    ...grad,
    angle: ensureFiniteNumber(grad.angle, 0),
    width: Math.max(0, ensureFiniteNumber(grad.width, 1)),
    opacity: clampRange(ensureFiniteNumber(grad.opacity, 1), 0, 1),
    stops,
  } as any;
}

function buildShape(shape: Shape, assets: Map<string, Asset>, onTextureReady: () => void): PIXI.Container | null {
  if (!shape.visible) return null;
  const layers: PIXI.Container[] = [];
  const dropLayer = buildDropShadowLayer(shape, assets, onTextureReady);
  if (dropLayer) layers.push(dropLayer);
  const glowLayer = buildGlowLayer(shape, assets, onTextureReady);
  if (glowLayer) layers.push(glowLayer);
  const base = buildBaseDisplay(shape, assets, onTextureReady);
  if (base) layers.push(base);
  if (!layers.length) return null;
  if (layers.length === 1) return layers[0] as any;
  const root = new PIXI.Container();
  layers.forEach((l) => root.addChild(l as any));
  return root;
}

function buildBaseDisplay(shape: Shape, assets: Map<string, Asset>, onTextureReady: () => void): PIXI.Container | null {
  if (!shape.visible) return null;

  if (shape.type === "text") {
    const textShape = shape as TextShape;
    const canvasMetrics =
      (PIXI as any).CanvasTextMetrics?.CanvasTextMetrics ?? (PIXI as any).CanvasTextMetrics;
    if (canvasMetrics && !canvasMetrics.__context) {
      try {
        // ensure CanvasTextMetrics initializes its internal canvas/context before measuring
        canvasMetrics._context; // eslint-disable-line @typescript-eslint/no-unused-expressions
        if (
          !canvasMetrics.__canvas ||
          !canvasMetrics.__context ||
          typeof canvasMetrics.__context.measureText !== "function"
        ) {
          const fallbackCanvas = document.createElement("canvas");
          fallbackCanvas.width = 16;
          fallbackCanvas.height = 16;
          canvasMetrics.__canvas = fallbackCanvas;
          canvasMetrics.__context = fallbackCanvas.getContext("2d");
        }
      } catch {
        // ignore and continue with Pixi defaults
      }
    }
    const textFill = textShape.textFill ?? { enabled: true, kind: "solid", color: textShape.textColor, opacity: 1 };
    const fillValue =
      textFill.kind === "linear"
        ? toPixiFill(textFill as any)
        : toRgbaString((textFill as any).color ?? textShape.textColor, (textFill as any).opacity ?? 1);
    const style = new PIXI.TextStyle({
      fontFamily: textShape.font,
      fontSize: textShape.fontSize,
      fontWeight: textShape.fontWeight,
      fontStyle: textShape.fontStyle ?? "normal",
      lineHeight: resolveLineHeight(textShape),
      letterSpacing: textShape.letterSpacing ?? 0,
      fill: fillValue as any,
      align: textShape.align,
      wordWrap: true,
      wordWrapWidth: Math.max(1, textShape.width),
      breakWords: true,
      whiteSpace: "normal",
    } as any);
    const container = new PIXI.Container();
    applyTransform(container, textShape);
    container.alpha = textShape.opacity;
    container.blendMode = toPixiBlendMode(textShape.blendMode);

    const textDisplay = new PIXI.Text({
      text: textShape.text,
      style,
    });
    if ((textDisplay as any).updateText) {
      try {
        (textDisplay as any).updateText();
      } catch {
        // ignore and let Pixi handle lazily
      }
    }
    textDisplay.roundPixels = true;

    const bounds = textDisplay.getLocalBounds?.() ?? { width: textShape.width, height: textShape.height };
    const metricsWidth = Math.max(1, (bounds as any).width ?? textShape.width);
    const metricsHeight = Math.max(1, (bounds as any).height ?? textShape.height);
    const boxWidth = Math.max(1, textShape.width);
    const boxHeight = Math.max(1, textShape.height);
    const extraX = boxWidth - metricsWidth;
    const extraY = boxHeight - metricsHeight;
    const vAlign = textShape.verticalAlign ?? "top";
    let offsetX = 0;
    if (textShape.align === "center") offsetX = extraX / 2;
    else if (textShape.align === "right") offsetX = extraX;
    if (!Number.isFinite(offsetX) || extraX < 0) offsetX = 0;

    let offsetY = 0;
    if (vAlign === "middle") offsetY = extraY / 2;
    else if (vAlign === "bottom") offsetY = extraY;
    if (!Number.isFinite(offsetY) || extraY < 0) offsetY = 0;

    textDisplay.x = offsetX;
    textDisplay.y = offsetY;

    const shouldClipToBox = !(textShape as any).__effectShape;
    if (shouldClipToBox) {
      const mask = new PIXI.Graphics();
      mask.rect(0, 0, boxWidth, boxHeight);
      if ((mask as any).fill) {
        (mask as any).fill(0xffffff);
      } else {
        (mask as any).beginFill?.(0xffffff);
        (mask as any).endFill?.();
      }
      container.addChild(mask);
      textDisplay.mask = mask;
    }
    container.addChild(textDisplay);

    applyFilters(container as any, textShape);
    return container;
  }

  if (shape.type === "image") {
    return buildMediaDisplay(shape as ImageShape, assets, onTextureReady);
  }

  if ((shape.fill as any)?.kind === "media" && (shape.fill as MediaFill).enabled) {
    return buildMediaFillDisplay(shape, shape.fill as MediaFill, assets, onTextureReady);
  }

  const g = new PIXI.Graphics();
  applyTransform(g, shape);
  g.alpha = shape.opacity;
  g.blendMode = toPixiBlendMode(shape.blendMode);

  drawShapePath(g, shape);

  if (shape.fill.enabled && shape.type !== "line" && (shape.type !== "path" || (shape as PathShape).closed)) {
    const fill = toPixiFill(shape.fill);
    g.fill(fill as any);
  }

  if (shape.stroke.enabled) {
    const stroke = toPixiStroke(shape.stroke);
    g.stroke(stroke as any);
  }

  applyFilters(g, shape);
  return g;
}

function buildMediaDisplay(shape: ImageShape, assets: Map<string, Asset>, onTextureReady: () => void): PIXI.Container | null {
  const asset = (shape.assetId && assets.get(shape.assetId)) || null;
  const texture = resolveTexture(asset, shape, onTextureReady);
  if (!texture) return null;

  const container = new PIXI.Container();
  applyTransform(container, shape);
  container.alpha = shape.opacity;
  container.blendMode = toPixiBlendMode(shape.blendMode);

  const localShape = { ...shape, x: 0, y: 0 };
  const sprite = createMediaSprite(texture, localShape, {
    mode: shape.fillMode ?? "cover",
    scale: shape.fillScale ?? 1,
    offset: shape.fillOffset ?? { x: 0, y: 0 },
    repeat: shape.repeat ?? false,
    asset,
  });
  container.addChild(sprite);

  const maskContainer = buildMaskContainer(localShape, shape.masks);
  if (maskContainer) {
    sprite.mask = maskContainer;
    container.addChild(maskContainer);
  }

  applyFilters(container as any, shape);
  return container;
}

function buildMediaFillDisplay(shape: Shape, fill: MediaFill, assets: Map<string, Asset>, onTextureReady: () => void): PIXI.Container | null {
  const asset = assets.get(fill.assetId);
  if (!asset) return null;
  const texture = resolveTexture(asset, shape as any, onTextureReady);
  if (!texture) return null;
  const container = new PIXI.Container();
  applyTransform(container, shape);
  container.alpha = shape.opacity;
  container.blendMode = toPixiBlendMode(shape.blendMode);

  const localShape = { ...shape, x: 0, y: 0 };
  const sprite = createMediaSprite(texture, localShape, {
    mode: fill.mode ?? "cover",
    scale: fill.scale ?? 1,
    offset: fill.offset ?? { x: 0, y: 0 },
    repeat: fill.repeat ?? false,
    asset,
  });

  const mask = buildMaskGraphics(localShape);
  if (mask) {
    sprite.mask = mask;
    container.addChild(sprite);
    container.addChild(mask);
  } else {
    container.addChild(sprite);
  }

  if (shape.stroke.enabled) {
    const stroke = toPixiStroke(shape.stroke);
    const strokeG = new PIXI.Graphics();
    drawShapePath(strokeG, localShape);
    strokeG.stroke(stroke as any);
    container.addChild(strokeG);
  }

  applyFilters(container as any, shape);
  return container;
}

function resolveTexture(asset: Asset | null, shape: ImageShape, onReady: () => void): PIXI.Texture | null {
  const src = asset?.src ?? shape.src;
  if (!src) return null;
  if (textureCache.has(src)) {
    return textureCache.get(src)!;
  }

  // Load image manually if Pixi doesn't attach a baseTexture (data URLs can sometimes skip the loader).
  if (asset?.kind === "image" && !textureLoading.has(src)) {
    textureLoading.add(src);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const tex = PIXI.Texture.from(img);
        textureCache.set(src, tex);
        onReady();
      } catch (err) {
        console.warn("Failed to build texture from image element", err);
      } finally {
        textureLoading.delete(src);
      }
    };
    img.onerror = () => {
      console.warn("Image load failed", src);
      textureLoading.delete(src);
    };
    img.src = src;
    return null;
  }

  let tex: PIXI.Texture | null = null;
  try {
    tex = PIXI.Texture.from(src);
  } catch (err) {
    console.warn("Failed to create texture", err);
    return null;
  }
  if (!tex || !(tex as any).baseTexture) {
    console.warn("Texture missing baseTexture", { src });
    return null;
  }
  const base: any = (tex as any).baseTexture;
  if (base && !base.valid) {
    base.once?.("loaded", () => onReady());
    base.once?.("update", () => onReady());
  }
  textureCache.set(src, tex);

  const resource: any = base?.resource;
  const video: HTMLVideoElement | undefined = resource?.source instanceof HTMLVideoElement ? resource.source : undefined;
  if (video) {
    video.loop = shape.playback?.loop ?? true;
    video.muted = shape.playback?.muted ?? true;
    if (shape.playback?.autoplay !== false) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }
  return tex;
}

function createMediaSprite(
  texture: PIXI.Texture,
  shape: Shape,
  fill: { mode: MediaFillMode; scale: number; offset: { x: number; y: number }; repeat?: boolean; asset?: Asset | null }
) {
  if (fill.mode === "tile" || fill.repeat) {
    const tiling = new PIXI.TilingSprite({ texture, width: Math.max(1, shape.width), height: Math.max(1, shape.height) });
    tiling.tilePosition.set(fill.offset.x, fill.offset.y);
    tiling.tileScale.set(fill.scale, fill.scale);
    return tiling;
  }
  const sprite = new PIXI.Sprite(texture);
  const naturalW = Math.max(1, fill.asset?.width ?? (texture as any).baseTexture?.realWidth ?? texture.width ?? shape.width ?? 1);
  const naturalH = Math.max(1, fill.asset?.height ?? (texture as any).baseTexture?.realHeight ?? texture.height ?? shape.height ?? 1);
  let drawW = naturalW;
  let drawH = naturalH;
  if (fill.mode === "cover") {
    const k = Math.max(shape.width / naturalW, shape.height / naturalH) * fill.scale;
    drawW = naturalW * k;
    drawH = naturalH * k;
  } else if (fill.mode === "contain") {
    const k = Math.min(shape.width / naturalW, shape.height / naturalH) * fill.scale;
    drawW = naturalW * k;
    drawH = naturalH * k;
  } else if (fill.mode === "stretch") {
    drawW = shape.width * fill.scale;
    drawH = shape.height * fill.scale;
  } else {
    drawW = naturalW * fill.scale;
    drawH = naturalH * fill.scale;
  }

  sprite.width = Math.max(1, drawW);
  sprite.height = Math.max(1, drawH);
  sprite.x = fill.offset.x + (shape.width - sprite.width) / 2;
  sprite.y = fill.offset.y + (shape.height - sprite.height) / 2;
  return sprite;
}

function buildMaskContainer(shape: Shape, masks?: any[]) {
  const normalizedShape = sanitizeShape(shape);
  const maskRoot = new PIXI.Container();
  const baseMask = buildMaskGraphics({ ...normalizedShape, x: 0, y: 0 } as Shape);
  if (baseMask) maskRoot.addChild(baseMask);

  (masks ?? []).forEach((mask: any) => {
    if (!mask || mask.visible === false) return;
    if (mask.kind === "shape" && mask.shape) {
      const g = buildMaskGraphics(sanitizeShape(mask.shape as Shape), mask.inverted ? normalizedShape : undefined, mask.inverted);
      if (g) maskRoot.addChild(g);
    }
  });

  if (!maskRoot.children.length) return null;
  return maskRoot;
}

function buildDropShadowLayer(shape: Shape, assets: Map<string, Asset>, onTextureReady: () => void) {
  const shadow = shape.shadow;
  if (!shadow || shadow.enabled === false || shadow.opacity <= 0) return null;
  const color = shadow.color ?? "#000000";
  const opacity = shadow.opacity ?? 0.16;
  const effectShape = createEffectShape(shape, color, opacity, shape.type === "line", {
    x: shadow.x ?? 0,
    y: shadow.y ?? 0,
  });
  const display = buildBaseDisplay(effectShape, assets, onTextureReady);
  if (!display) return null;
  const blurStrength = Math.max(0, shadow.blur ?? 0);
  const quality = shadow.quality ?? "medium";
  // Higher sample counts/resolution for visibly smoother shadows
  const qualitySettings =
    quality === "high"
      ? { quality: 14, resolution: 1.3 }
      : quality === "low"
        ? { quality: 7, resolution: 1 }
        : { quality: 10, resolution: 1.15 };
  const blur = new PIXI.BlurFilter({ strength: blurStrength, ...qualitySettings }) as any;
  blur.padding = Math.max(shadow.spread ?? 0, blur.padding ?? 0);
  (display as any).filters = [blur];
  if ("tint" in (display as any)) (display as any).tint = parseColor(color).color;
  (display as any).alpha = (effectShape as any).opacity ?? opacity;
  return display as any;
}

function buildGlowLayer(shape: Shape, assets: Map<string, Asset>, onTextureReady: () => void) {
  const glow = (shape as any).glow as any;
  if (!glow || glow.enabled === false || glow.opacity <= 0) return null;
  const color = glow.color ?? "#4f46e5";
  const opacity = glow.opacity ?? 0.35;
  const offset = glow.offset ?? { x: 0, y: 0 };
  const effectShape = createEffectShape(shape, color, opacity, true, offset);
  const display = buildBaseDisplay(effectShape, assets, onTextureReady);
  if (!display) return null;
  const blurStrength = Math.max(0, glow.blur ?? 0);
  const quality = glow.quality ?? "medium";
  // Higher sample counts/resolution for visibly smoother glows
  const qualitySettings =
    quality === "high"
      ? { quality: 14, resolution: 1.3 }
      : quality === "low"
        ? { quality: 7, resolution: 1 }
        : { quality: 10, resolution: 1.15 };
  const blur = new PIXI.BlurFilter({ strength: blurStrength, ...qualitySettings }) as any;
  blur.padding = Math.max(glow.spread ?? 0, blur.padding ?? 0);
  (display as any).filters = [blur];
  (display as any).blendMode = "screen" as any;
  if ("tint" in (display as any)) (display as any).tint = parseColor(color).color;
  if ((glow.mode ?? "outer") === "inner") {
    const mask = buildMaskGraphics(shape);
    if (mask) {
      (display as any).mask = mask;
      const container = new PIXI.Container();
      container.addChild(display as any);
      container.addChild(mask);
      return container;
    }
  }
  return display as any;
}

function createEffectShape(
  shape: Shape,
  color: string,
  opacity: number,
  includeStroke: boolean,
  offset?: { x: number; y: number }
) {
  const cloned: any = structuredClone(shape);
  cloned.__effectShape = true;
  const parsed = parseColor(color);
  cloned.x = shape.x + (offset?.x ?? 0);
  cloned.y = shape.y + (offset?.y ?? 0);
  cloned.opacity = opacity * parsed.alpha;
  cloned.effects = { blur: 0, backgroundBlur: 0 };
  cloned.shadow = null;
  cloned.glow = null;
  if (shape.type === "text") {
    cloned.textFill = { enabled: true, kind: "solid", color, opacity: 1 };
    cloned.textColor = color;
  } else {
    cloned.fill = { enabled: true, kind: "solid", color, opacity: 1 };
    cloned.stroke =
      includeStroke && shape.stroke
        ? {
            enabled: true,
            kind: "solid",
            color,
            width: shape.stroke.width,
            align: shape.stroke.align,
            dashed: false,
            opacity: 1,
          }
        : { ...(shape.stroke || {}), enabled: false };
  }
  return cloned as Shape;
}

function drawShapePath(g: PIXI.Graphics, shape: Shape) {
  if (shape.type === "rectangle") {
    g.roundRect(0, 0, shape.width, shape.height, (shape as any).radius?.tl ?? 0);
    return;
  }
  if (shape.type === "ellipse") {
    g.ellipse(shape.width / 2, shape.height / 2, shape.width / 2, shape.height / 2);
    return;
  }
  if (shape.type === "line") {
    g.moveTo(0, 0);
    g.lineTo(shape.width, shape.height);
    return;
  }
  if (shape.type === "path") {
    const p = shape as PathShape;
    if (p.points.length >= 2) {
      g.moveTo(p.points[0].x, p.points[0].y);
      const count = p.points.length;
      const segCount = p.closed ? count : count - 1;
      for (let i = 0; i < segCount; i++) {
        const a = p.points[i];
        const b = p.points[(i + 1) % count];
        const c1 = a.out ?? { x: a.x, y: a.y };
        const c2 = b.in ?? { x: b.x, y: b.y };
        const isCurve =
          (a.out && (a.out.x !== a.x || a.out.y !== a.y)) ||
          (b.in && (b.in.x !== b.x || b.in.y !== b.y));
        if (isCurve) {
          g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
        } else {
          g.lineTo(b.x, b.y);
        }
      }
      if (p.closed) g.closePath();
    }
  }
}

function applyFilters(display: PIXI.Container, shape: Shape) {
  const blur = shape.effects?.blur ?? 0;
  if (blur > 0) {
    display.filters = [new PIXI.BlurFilter({ strength: blur, quality: 4, resolution: 1 }) as any];
  }
}

function resolveLineHeight(textShape: TextShape) {
  const lh = textShape.lineHeight ?? 1.2;
  const fontSize = textShape.fontSize || 16;
  const isPixelValue = lh > 10;
  return isPixelValue ? lh : lh * fontSize;
}

function applyTransform(display: PIXI.Container, shape: Shape) {
  const m = deriveMatrix(shape);
  const scaleX = Math.hypot(m.a, m.b) || 1;
  const scaleY = Math.hypot(m.c, m.d) || 1;
  const rotation = Math.atan2(m.b, m.a);
  display.position.set(m.e, m.f);
  display.scale.set(scaleX, scaleY);
  (display as any).rotation = rotation;
}

function deriveMatrix(shape: Shape) {
  const sx = (shape as any).scale?.x ?? 1;
  const sy = (shape as any).scale?.y ?? 1;
  if (shape.matrix) {
    const base = DOMMatrix.fromMatrix(shape.matrix as DOMMatrixInit);
    base.e = shape.x;
    base.f = shape.y;
    base.a *= sx;
    base.b *= sx;
    base.c *= sy;
    base.d *= sy;
    return base;
  }
  const theta = ((shape.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return new DOMMatrix([cos * sx, sin * sx, -sin * sy, cos * sy, shape.x, shape.y]);
}

function toPixiFill(fill: Fill) {
  if (!fill.enabled) return { color: 0x000000, alpha: 0 };
  if (fill.kind === "solid") {
    const parsed = parseColor(fill.color as any);
    return { color: parsed.color, alpha: fill.opacity };
  }
  if (fill.kind === "media") {
    return { color: 0xffffff, alpha: 0 };
  }
  if (fill.kind === "linear") {
    const grad = new (PIXI as any).FillGradient({
      start: { x: 0, y: 0 },
      end: angleToUnit(fill.angle),
      textureSpace: "local",
      colorStops: fill.stops
        .slice()
        .sort((a, b) => a.offset - b.offset)
        .map((s) => ({ offset: s.offset, color: toRgbaString(s.color, s.opacity) })),
    });
    return grad as any;
  }
  return { color: 0xffffff, alpha: 0 };
}

function toPixiStroke(stroke: Stroke) {
  const align = stroke.align === "inside" ? 1 : stroke.align === "outside" ? 0 : 0.5;
  if (stroke.kind === "linear") {
    const grad = new (PIXI as any).FillGradient({
      start: { x: 0, y: 0 },
      end: angleToUnit(stroke.angle),
      textureSpace: "local",
      colorStops: stroke.stops
        .slice()
        .sort((a, b) => a.offset - b.offset)
        .map((s) => ({ offset: s.offset, color: toRgbaString(s.color, s.opacity) })),
    });
    return {
      width: stroke.width,
      fill: grad,
      alignment: align,
      alpha: stroke.opacity,
      cap: "round",
      join: "round",
      dash: stroke.dashed ? [8, 4] : undefined,
    };
  }

  return {
    width: stroke.width,
    color: stroke.color,
    alpha: stroke.opacity,
    alignment: align,
    cap: "round",
    join: "round",
    dash: stroke.dashed ? [8, 4] : undefined,
  };
}

function angleToUnit(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function parseColor(input: string): { color: number; alpha: number; r: number; g: number; b: number } {
  // #RRGGBB
  if (input.startsWith("#") && input.length === 7) {
    const color = parseInt(input.slice(1), 16);
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    return { color, alpha: 1, r, g, b };
  }

  // #RRGGBBAA
  if (input.startsWith("#") && input.length === 9) {
    const rgb = parseInt(input.slice(1, 7), 16);
    const a = parseInt(input.slice(7, 9), 16) / 255;
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    return { color: rgb, alpha: a, r, g, b };
  }

  const rgba = input.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    const r = Number(parts[0] ?? 0);
    const g = Number(parts[1] ?? 0);
    const b = Number(parts[2] ?? 0);
    const a = parts.length >= 4 ? Number(parts[3]) : 1;
    const color = (r << 16) + (g << 8) + b;
    return { color, alpha: a, r, g, b };
  }

  // fallback
  return { color: 0xffffff, alpha: 1, r: 255, g: 255, b: 255 };
}

function toPixiBlendMode(mode: Shape["blendMode"] | undefined) {
  return (mode ?? "normal") as any;
}

function buildMaskGraphics(shape: Shape, bounds?: Shape, inverted = false) {
  const safeShape = sanitizeShape(shape);
  const g = new PIXI.Graphics();
  g.x = safeShape.x ?? 0;
  g.y = safeShape.y ?? 0;
  g.rotation = degToRad(safeShape.rotation ?? 0);
  const drawMask = () => {
    if (safeShape.type === "rectangle" || safeShape.type === "ellipse" || safeShape.type === "line" || safeShape.type === "path") {
      drawShapePath(g, safeShape);
      return;
    }
    g.rect(0, 0, safeShape.width, safeShape.height);
  };

  if (inverted) {
    const area = bounds ? sanitizeShape(bounds) : safeShape;
    g.rect(0, 0, area.width, area.height);
    if ((g as any).beginHole) {
      (g as any).beginHole();
      drawMask();
      (g as any).endHole();
      g.fill(0xffffff);
      return g;
    }
  }

  drawMask();
  g.fill(0xffffff);
  if (safeShape.type === "line") {
    g.stroke({ width: Math.max(1, (safeShape.stroke as any)?.width ?? 2), color: 0xffffff, alpha: 1 } as any);
  }
  return g;
}

function renderNodes(args: {
  nodes: LayerNode[];
  parent: PIXI.Container;
  world: PIXI.Container;
  app: PIXI.Application;
  createdRenderTextures: PIXI.Texture[];
  idToDisplay: Map<string, PIXI.Container>;
  artboard: { width: number; height: number };
  assets: Map<string, Asset>;
  onTextureReady: () => void;
}) {
  for (const node of args.nodes) {
    if (node.kind === "group") {
      const groupContainer = new PIXI.Container();
      groupContainer.visible = node.visible;
      groupContainer.name = node.name;
      args.parent.addChild(groupContainer);

      renderNodes({ ...args, nodes: node.children, parent: groupContainer });

      if (node.mask?.enabled) {
        const maskDisplay = args.idToDisplay.get(node.mask.maskId);
        if (maskDisplay) {
          groupContainer.mask = maskDisplay;
          maskDisplay.visible = false;
        }
      }
      continue;
    }

    const shape = sanitizeShape(node.shape);
    const bg = shape.effects?.backgroundBlur ?? 0;
    if (bg > 0) {
      const rt = (PIXI as any).RenderTexture.create({
        width: args.artboard.width,
        height: args.artboard.height,
        resolution: (args.app.renderer as any).resolution ?? 1,
      });
      args.createdRenderTextures.push(rt);
      (args.app.renderer as any).render({
        container: args.world,
        target: rt,
        clear: true,
        transform: new (PIXI as any).Matrix(),
      });

      const blurred = new PIXI.Sprite(rt);
      blurred.filters = [new PIXI.BlurFilter({ strength: bg }) as any];
      const mask = buildMaskGraphics(shape);
      blurred.mask = mask;
      args.parent.addChild(blurred);
      args.parent.addChild(mask);
    }

    const display = buildShape(shape, args.assets, args.onTextureReady);
    if (display) {
      args.idToDisplay.set(shape.id, display);
      args.parent.addChild(display);
    }
  }
}

function toRgbaString(color: string, opacity: number) {
  const parsed = parseColor(color);
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${parsed.alpha * opacity})`;
}
