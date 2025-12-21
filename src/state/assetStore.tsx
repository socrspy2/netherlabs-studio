import React, { useCallback, useMemo, useRef, useState } from "react";
import { Asset, AssetKind } from "./types";
import { probeImageSize, probeVideoMetadata, readFileAsDataURL } from "../utils/media";

type AssetContextValue = {
  assets: Asset[];
  assetsById: Map<string, Asset>;
  maps: string[];
  addMap: (name: string) => void;
  setAssetMap: (assetId: string, map?: string) => void;
  importAssets: (files: File[], opts?: { expectedKind?: AssetKind }) => Promise<Asset[]>;
  addAsset: (asset: Asset) => Promise<Asset>;
  removeAsset: (id: string) => void;
};

const AssetContext = React.createContext<AssetContextValue | null>(null);

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [maps, setMaps] = useState<string[]>(["Default"]);
  const counterRef = useRef<{ image: number; video: number }>({ image: 0, video: 0 });

  const assetsById = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const addAsset = useCallback(async (asset: Asset) => {
    setAssets((prev) => [...prev, asset]);
    return asset;
  }, []);

  const addMap = useCallback((name: string) => {
    setMaps((prev) => {
      if (!name.trim()) return prev;
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
  }, []);

  const setAssetMap = useCallback((assetId: string, map?: string) => {
    setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, map } : a)));
  }, []);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const makeName = useCallback(
    (kind: AssetKind) => {
      const base = kind === "video" ? "Video" : "Image";
      counterRef.current[kind] = (counterRef.current[kind] ?? 0) + 1;
      return `${base}(${counterRef.current[kind]})`;
    },
    []
  );

  const importAssets = useCallback(
    async (files: File[], opts?: { expectedKind?: AssetKind }) => {
      const accepted = files.filter((file) => {
        const isImage = IMAGE_TYPES.includes(file.type);
        const isVideo = VIDEO_TYPES.includes(file.type);
        if (opts?.expectedKind === "image") return isImage;
        if (opts?.expectedKind === "video") return isVideo;
        return isImage || isVideo;
      });
      const results: Asset[] = [];
      for (const file of accepted) {
        const kind: AssetKind = opts?.expectedKind ?? (file.type.startsWith("video/") ? "video" : "image");
        const src = await readFileAsDataURL(file);
        if (kind === "image") {
          const { width, height } = await probeImageSize(src);
          const asset: Asset = {
            id: crypto.randomUUID(),
            kind,
            name: makeName(kind),
            mimeType: file.type || "image/png",
            src,
            width: Math.max(1, width),
            height: Math.max(1, height),
            map: maps[0] ?? "Default",
            createdAt: Date.now(),
          };
          results.push(await addAsset(asset));
          continue;
        }

        const { width, height, duration, poster } = await probeVideoMetadata(src);
        const asset: Asset = {
          id: crypto.randomUUID(),
          kind,
          name: makeName(kind),
          mimeType: file.type || "video/mp4",
          src,
          width: Math.max(1, width || 640),
          height: Math.max(1, height || 360),
          duration: duration ?? 0,
          poster,
          map: maps[0] ?? "Default",
          createdAt: Date.now(),
        };
        results.push(await addAsset(asset));
      }
      return results;
    },
    [addAsset, makeName, maps]
  );

  const value = useMemo<AssetContextValue>(
    () => ({
      assets,
      assetsById,
      maps,
      addMap,
      setAssetMap,
      importAssets,
      addAsset,
      removeAsset,
    }),
    [assets, assetsById, maps, addMap, setAssetMap, importAssets, addAsset, removeAsset]
  );

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets() {
  const ctx = React.useContext(AssetContext);
  if (!ctx) throw new Error("AssetContext missing");
  return ctx;
}
