export function parseNumericInput(raw: string): number | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed === "-" || trimmed === "." || trimmed === "-.") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) === Infinity) return null;
  return value;
}

export function clampRange(value: number, min?: number, max?: number) {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min as number, next);
  if (Number.isFinite(max)) next = Math.min(max as number, next);
  return next;
}

export function ensureFiniteNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function formatNumeric(value: number, precision = 4) {
  if (!Number.isFinite(value)) return "";
  const pow = Math.pow(10, precision);
  const rounded = Math.round(value * pow) / pow;
  return `${rounded}`;
}
