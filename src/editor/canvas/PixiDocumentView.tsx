import React, { useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { useEditor } from "../../state/editorStore";
import { Fill, ImageShape, LayerNode, PathShape, Shape, Stroke, TextShape } from "../../state/types";

const DEFAULT_ARTBOARD = { width: 1800, height: 1200 };

export function PixiDocumentView() {
  const { doc } = useEditor();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const rootRef = useRef<PIXI.Container | null>(null);
  const worldRef = useRef<PIXI.Container | null>(null);
  const mountedRef = useRef(false);
  const [readyTick, setReadyTick] = useState(0);
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

  // render
  const flatLayers = useMemo(() => doc.layers, [doc.layers]);
  useEffect(() => {
    const world = worldRef.current;
    const app = appRef.current;
    if (!world || !app) return;

    const createdRenderTextures: PIXI.Texture[] = [];
    const idToDisplay = new Map<string, PIXI.Container>();

    world.removeChildren();
    renderNodes({
      nodes: flatLayers,
      parent: world,
      world,
      app,
      createdRenderTextures,
      idToDisplay,
      artboard,
    });

    try {
      app.render();
    } catch {
      // ignore
    }

    return () => {
      createdRenderTextures.forEach((t) => t.destroy(true));
    };
  }, [flatLayers, readyTick, artboard.height, artboard.width]);

  return <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />;
}

function buildShape(shape: Shape): PIXI.Container | null {
  if (!shape.visible) return null;
  const layers: PIXI.Container[] = [];
  const dropLayer = buildDropShadowLayer(shape);
  if (dropLayer) layers.push(dropLayer);
  const glowLayer = buildGlowLayer(shape);
  if (glowLayer) layers.push(glowLayer);
  const base = buildBaseDisplay(shape);
  if (base) layers.push(base);
  if (!layers.length) return null;
  if (layers.length === 1) return layers[0] as any;
  const root = new PIXI.Container();
  layers.forEach((l) => root.addChild(l as any));
  return root;
}

function buildBaseDisplay(shape: Shape): PIXI.Container | null {
  if (!shape.visible) return null;

  if (shape.type === "text") {
    const textShape = shape as TextShape;
    const fill = toPixiFill(
      textShape.textFill ?? { enabled: true, kind: "solid", color: textShape.textColor, opacity: 1 }
    );
    const t = new PIXI.Text({
      text: textShape.text,
      style: {
        fontFamily: textShape.font,
        fontSize: textShape.fontSize,
        fontWeight: textShape.fontWeight,
        fill,
        align: textShape.align,
      } as any,
    });
    t.x = textShape.x;
    t.y = textShape.y;
    t.rotation = degToRad(textShape.rotation);
    t.alpha = textShape.opacity;
    t.blendMode = toPixiBlendMode(textShape.blendMode);
    applyFilters(t, textShape);
    return t;
  }

  if (shape.type === "image") {
    const img = shape as ImageShape;
    if (!img.src) return null;
    const sprite = new PIXI.Sprite(PIXI.Texture.from(img.src));
    sprite.x = img.x;
    sprite.y = img.y;
    sprite.width = img.width;
    sprite.height = img.height;
    sprite.rotation = degToRad(img.rotation);
    sprite.alpha = img.opacity;
    sprite.blendMode = toPixiBlendMode(img.blendMode);
    applyFilters(sprite as any, img);
    return sprite as any;
  }

  const g = new PIXI.Graphics();
  g.x = shape.x;
  g.y = shape.y;
  g.rotation = degToRad(shape.rotation);
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

function buildDropShadowLayer(shape: Shape) {
  const shadow = shape.shadow;
  if (!shadow || shadow.enabled === false || shadow.opacity <= 0) return null;
  const color = shadow.color ?? "#000000";
  const opacity = shadow.opacity ?? 0.16;
  const effectShape = createEffectShape(shape, color, opacity, shape.type === "line", {
    x: shadow.x ?? 0,
    y: shadow.y ?? 0,
  });
  const display = buildBaseDisplay(effectShape);
  if (!display) return null;
  const blurStrength = Math.max(0, shadow.blur ?? 0);
  const blur = new PIXI.BlurFilter({ strength: blurStrength, quality: 4, resolution: 1 }) as any;
  blur.padding = Math.max(shadow.spread ?? 0, blur.padding ?? 0);
  (display as any).filters = [blur];
  if ("tint" in (display as any)) (display as any).tint = parseColor(color).color;
  (display as any).alpha = (effectShape as any).opacity ?? opacity;
  return display as any;
}

function buildGlowLayer(shape: Shape) {
  const glow = (shape as any).glow as any;
  if (!glow || glow.enabled === false || glow.opacity <= 0) return null;
  const color = glow.color ?? "#4f46e5";
  const opacity = glow.opacity ?? 0.35;
  const offset = glow.offset ?? { x: 0, y: 0 };
  const effectShape = createEffectShape(shape, color, opacity, true, offset);
  const display = buildBaseDisplay(effectShape);
  if (!display) return null;
  const blurStrength = Math.max(0, glow.blur ?? 0);
  const blur = new PIXI.BlurFilter({ strength: blurStrength, quality: 4, resolution: 1 }) as any;
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

function toPixiFill(fill: Fill) {
  if (!fill.enabled) return { color: 0x000000, alpha: 0 };
  if (fill.kind === "solid") {
    return { color: fill.color, alpha: fill.opacity };
  }
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

function buildMaskGraphics(shape: Shape) {
  const g = new PIXI.Graphics();
  g.x = shape.x;
  g.y = shape.y;
  g.rotation = degToRad(shape.rotation);
  if (shape.type === "rectangle" || shape.type === "ellipse" || shape.type === "line" || shape.type === "path") {
    drawShapePath(g, shape);
    g.fill(0xffffff);
    if (shape.type === "line") {
      g.stroke({ width: Math.max(1, (shape.stroke as any)?.width ?? 2), color: 0xffffff, alpha: 1 } as any);
    }
    return g;
  }
  g.rect(0, 0, shape.width, shape.height);
  g.fill(0xffffff);
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

    const shape = node.shape;
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

    const display = buildShape(shape);
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
