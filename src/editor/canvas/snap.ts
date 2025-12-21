import { GridSettings } from "../../state/types";

export type SnapOptions = {
  altPressed?: boolean;
};

export type SnapManager = {
  snapValue: (v: number, opts?: SnapOptions) => number;
  snapPoint: (pt: { x: number; y: number }, opts?: SnapOptions) => { x: number; y: number };
  snapRect: (
    rect: { x: number; y: number; width: number; height: number },
    opts?: SnapOptions
  ) => { x: number; y: number; width: number; height: number };
  enabled: boolean;
  step: number;
  threshold: number;
};

export function createSnapManager(settings: GridSettings): SnapManager {
  const step = Math.max(1, settings.size || 1);
  const threshold = Math.max(1, Math.min(6, step * 0.65));

  const shouldSnap = (opts?: SnapOptions) => settings.magnetic && !opts?.altPressed;

  const snapValue = (v: number, opts?: SnapOptions) => {
    if (!shouldSnap(opts)) return v;
    const snapped = Math.round(v / step) * step;
    return Math.abs(snapped - v) <= threshold ? snapped : v;
  };

  const snapPoint = (pt: { x: number; y: number }, opts?: SnapOptions) => ({
    x: snapValue(pt.x, opts),
    y: snapValue(pt.y, opts),
  });

  const snapRect = (rect: { x: number; y: number; width: number; height: number }, opts?: SnapOptions) => {
    if (!shouldSnap(opts)) return rect;
    const snappedX = snapValue(rect.x, opts);
    const snappedY = snapValue(rect.y, opts);
    const snappedR = snapValue(rect.x + rect.width, opts);
    const snappedB = snapValue(rect.y + rect.height, opts);
    return {
      x: snappedX,
      y: snappedY,
      width: Math.max(1, snappedR - snappedX),
      height: Math.max(1, snappedB - snappedY),
    };
  };

  return { snapValue, snapPoint, snapRect, enabled: settings.magnetic, step, threshold };
}
