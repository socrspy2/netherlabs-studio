import { useCallback, useMemo } from "react";
import { useAssets } from "../state/assetStore";
import { useEditor, createShapeForTool } from "../state/editorStore";
import { Asset, AssetKind, ImageShape, MediaFill, MediaFillMode } from "../state/types";
import { flatten } from "../state/layers";
import { probeImageSize } from "../utils/media";

type PlacementOpts = {
  point?: { x: number; y: number };
  mode?: "auto" | "layer" | "fill";
  expectedKind?: AssetKind;
};

export function useAssetActions() {
  const { assetsById, importAssets, addAsset } = useAssets();
  const { doc, createShape, applyShapePatches, checkpoint, setSelection } = useEditor();

  const canvasCenter = useMemo(() => {
    const canvas = doc.canvasSize ?? { width: 1440, height: 900 };
    return { x: canvas.width / 2, y: canvas.height / 2 };
  }, [doc.canvasSize]);

  const placeAssetAsLayer = useCallback(
    (asset: Asset, opts?: PlacementOpts) => {
      const maxWidth = 640;
      const aspect = asset.height ? asset.width / Math.max(1, asset.height) : 1;
      const width = Math.min(maxWidth, asset.width || maxWidth);
      const height = Math.max(20, width / Math.max(0.0001, aspect));
      const origin = opts?.point ?? canvasCenter;
      const x = origin.x - width / 2;
      const y = origin.y - height / 2;
      const base = createShapeForTool("rectangle" as any, { x, y }) as any;
      const shape: ImageShape = {
        ...(base as any),
        id: crypto.randomUUID(),
        type: "image",
        name: asset.name,
        x,
        y,
        width,
        height,
        src: asset.poster ?? asset.src,
        assetId: asset.id,
        mediaKind: asset.kind,
        fillMode: "cover",
        fillOffset: { x: 0, y: 0 },
        fillScale: 1,
        repeat: false,
        masks: [],
        playback: { autoplay: true, loop: true, muted: true },
        stroke: { ...(base.stroke || {}), enabled: false },
        fill: { ...(base.fill || {}), enabled: false },
      };
      createShape(shape);
    },
    [canvasCenter, createShape]
  );

  const fillSelectionWithAsset = useCallback(
    (asset: Asset) => {
      if (!doc.selection.length) return;
      const mediaFill: MediaFill = {
        enabled: true,
        kind: "media",
        assetId: asset.id,
        mode: "cover",
        offset: { x: 0, y: 0 },
        scale: 1,
        repeat: false,
      };
      const patches = doc.selection.map((id) => ({
        id,
        changes: (shape: any) => {
          if (shape.type === "image") {
            const img = shape as ImageShape;
            return {
              ...img,
              assetId: asset.id,
              mediaKind: asset.kind,
              src: asset.poster ?? asset.src,
              fillMode: img.fillMode ?? "cover",
              fillOffset: img.fillOffset ?? { x: 0, y: 0 },
              fillScale: img.fillScale ?? 1,
              repeat: img.repeat ?? false,
            };
          }
          return { ...shape, fill: mediaFill };
        },
      }));
      checkpoint();
      applyShapePatches(patches, true);
    },
    [applyShapePatches, checkpoint, doc.selection]
  );

  const importAndPlace = useCallback(
    async (files: File[], opts?: PlacementOpts) => {
      try {
        const imported = await importAssets(files, { expectedKind: opts?.expectedKind ?? undefined });
        if (!imported.length) return imported;
        if (opts?.mode === "fill" || (opts?.mode !== "layer" && doc.selection.length)) {
          fillSelectionWithAsset(imported[0]);
          return imported;
        }
        const startPoint = opts?.point ?? canvasCenter;
        imported.forEach((asset, idx) => {
          placeAssetAsLayer(asset, {
            point: { x: startPoint.x + idx * 18, y: startPoint.y + idx * 18 },
            mode: "layer",
          });
        });
        return imported;
      } catch (err) {
        console.error("Import failed", err);
        return [];
      }
    },
    [canvasCenter, doc.selection.length, fillSelectionWithAsset, importAssets, placeAssetAsLayer]
  );

  const exportCutout = useCallback(
    async () => {
      if (!doc.selection.length) return null;
      const flat = flatten(doc.layers);
      const node = flat.find((n) => n.kind === "shape" && doc.selection.includes(n.id) && (n as any).shape?.type === "image") as any;
      if (!node) return null;
      const shape = node.shape as ImageShape;
      const asset = (shape.assetId && assetsById.get(shape.assetId)) || undefined;
      const sourceUrl = asset?.src ?? shape.src;
      if (!sourceUrl) return null;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(shape.width));
      canvas.height = Math.max(1, Math.round(shape.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const img = await loadBitmap(sourceUrl, shape.mediaKind ?? asset?.kind ?? "image");
      const mode = shape.fillMode ?? "cover";
      const scale = shape.fillScale ?? 1;
      const offset = shape.fillOffset ?? { x: 0, y: 0 };

      ctx.save();
      if (shape.masks?.length) {
        ctx.beginPath();
        let drew = false;
        for (const mask of shape.masks) {
          if (mask.kind !== "shape" || mask.visible === false) continue;
          drew = true;
          drawShapePath2d(ctx, mask.shape);
        }
        if (drew) ctx.clip();
      }

      drawMediaOnCanvas(ctx, img, {
        mode,
        offset,
        scale,
        target: { width: canvas.width, height: canvas.height },
      });
      ctx.restore();

      const dataUrl = canvas.toDataURL("image/png");
      const size = await probeImageSize(dataUrl);
      const newAsset = await addAsset({
        id: crypto.randomUUID(),
        kind: "image",
        name: `${shape.name} cutout`,
        mimeType: "image/png",
        src: dataUrl,
        width: size.width,
        height: size.height,
        createdAt: Date.now(),
      });
      placeAssetAsLayer(newAsset, { mode: "layer", point: { x: shape.x + shape.width + 24, y: shape.y } });
      setSelection([shape.id]);
      return newAsset;
    },
    [addAsset, assetsById, doc.layers, doc.selection, placeAssetAsLayer, setSelection]
  );

  return {
    assetsById,
    importAndPlace,
    placeAssetAsLayer,
    fillSelectionWithAsset,
    exportCutout,
  };
}

async function loadBitmap(src: string, kind: Asset["kind"]) {
  if (kind === "video") {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => resolve();
      video.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, video.videoWidth || 1);
    canvas.height = Math.max(1, video.videoHeight || 1);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
  return img;
}

function drawMediaOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  opts: { mode: MediaFillMode; offset: { x: number; y: number }; scale: number; target: { width: number; height: number }; repeat?: boolean }
) {
  const mode = opts.mode ?? "cover";
  const { offset, scale, target } = opts;
  const naturalW = (source as any).naturalWidth ?? (source as any).width ?? target.width;
  const naturalH = (source as any).naturalHeight ?? (source as any).height ?? target.height;
  let drawW = naturalW;
  let drawH = naturalH;

  if (mode === "cover") {
    const k = Math.max(target.width / naturalW, target.height / naturalH) * scale;
    drawW = naturalW * k;
    drawH = naturalH * k;
  } else if (mode === "contain") {
    const k = Math.min(target.width / naturalW, target.height / naturalH) * scale;
    drawW = naturalW * k;
    drawH = naturalH * k;
  } else if (mode === "stretch") {
    drawW = target.width * scale;
    drawH = target.height * scale;
  } else {
    drawW = naturalW * scale;
    drawH = naturalH * scale;
  }

  const x = (target.width - drawW) / 2 + offset.x;
  const y = (target.height - drawH) / 2 + offset.y;

  if (mode === "tile") {
    const pattern = ctx.createPattern(source, "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = pattern;
    ctx.fillRect(-offset.x, -offset.y, target.width + Math.abs(offset.x), target.height + Math.abs(offset.y));
    ctx.restore();
    return;
  }

  ctx.drawImage(source, x, y, drawW, drawH);
}

function drawShapePath2d(ctx: CanvasRenderingContext2D, shape: any) {
  ctx.beginPath();
  if (shape.type === "rectangle") {
    const r = (shape.radius?.tl ?? 0) as number;
    const w = shape.width;
    const h = shape.height;
    if (r > 0) {
      const rr = Math.min(r, Math.min(w, h) / 2);
      ctx.moveTo(shape.x + rr, shape.y);
      ctx.lineTo(shape.x + w - rr, shape.y);
      ctx.quadraticCurveTo(shape.x + w, shape.y, shape.x + w, shape.y + rr);
      ctx.lineTo(shape.x + w, shape.y + h - rr);
      ctx.quadraticCurveTo(shape.x + w, shape.y + h, shape.x + w - rr, shape.y + h);
      ctx.lineTo(shape.x + rr, shape.y + h);
      ctx.quadraticCurveTo(shape.x, shape.y + h, shape.x, shape.y + h - rr);
      ctx.lineTo(shape.x, shape.y + rr);
      ctx.quadraticCurveTo(shape.x, shape.y, shape.x + rr, shape.y);
    } else {
      ctx.rect(shape.x, shape.y, shape.width, shape.height);
    }
    ctx.closePath();
    return;
  }
  if (shape.type === "ellipse") {
    ctx.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (shape.type === "path") {
    const points = shape.points ?? [];
    if (!points.length) return;
    ctx.moveTo(shape.x + points[0].x, shape.y + points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const c1 = a.out ?? a;
      const c2 = b.in ?? b;
      const isCurve =
        (a.out && (a.out.x !== a.x || a.out.y !== a.y)) || (b.in && (b.in.x !== b.x || b.in.y !== b.y));
      if (isCurve) {
        ctx.bezierCurveTo(shape.x + c1.x, shape.y + c1.y, shape.x + c2.x, shape.y + c2.y, shape.x + b.x, shape.y + b.y);
      } else {
        ctx.lineTo(shape.x + b.x, shape.y + b.y);
      }
    }
    if (shape.closed) ctx.closePath();
    return;
  }
  ctx.rect(shape.x, shape.y, shape.width, shape.height);
}
