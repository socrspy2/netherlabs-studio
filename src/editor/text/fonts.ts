export type FontOption = {
  id: string;
  label: string;
  family: string;
  weights: number[];
};

export const FONT_OPTIONS: FontOption[] = [
  { id: "inter", label: "Inter", family: "Inter", weights: [400, 500, 600, 700, 800] },
  { id: "roboto", label: "Roboto", family: "Roboto", weights: [400, 500, 700, 900] },
  { id: "poppins", label: "Poppins", family: "Poppins", weights: [400, 500, 600, 700] },
  { id: "montserrat", label: "Montserrat", family: "Montserrat", weights: [400, 600, 700, 800] },
  { id: "open-sans", label: "Open Sans", family: "Open Sans", weights: [400, 600, 700, 800] },
  { id: "lato", label: "Lato", family: "Lato", weights: [400, 600, 700, 900] },
  { id: "raleway", label: "Raleway", family: "Raleway", weights: [400, 500, 600, 700] },
  { id: "oswald", label: "Oswald", family: "Oswald", weights: [400, 500, 600, 700] },
  { id: "playfair", label: "Playfair Display", family: "Playfair Display", weights: [400, 600, 700] },
  { id: "nunito", label: "Nunito", family: "Nunito", weights: [400, 600, 700, 800] },
  { id: "source-sans", label: "Source Sans 3", family: "Source Sans 3", weights: [400, 600, 700, 800] },
  { id: "merriweather", label: "Merriweather", family: "Merriweather", weights: [400, 700, 900] },
];

export const FALLBACK_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const loadedUrls = new Set<string>();

export function normalizeFontName(input: string) {
  const family = (input || "").split(",")[0] ?? "";
  return family.trim().replace(/^['"]|['"]$/g, "");
}

export function findFontOption(fontFamily: string) {
  const normalized = normalizeFontName(fontFamily);
  return FONT_OPTIONS.find((f) => f.family === normalized) ?? null;
}

export async function ensureFontLoaded(option: FontOption) {
  const upright = option.weights.map((w) => `0,${w}`).join(";");
  const italic = option.weights.map((w) => `1,${w}`).join(";");
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(option.family)}:ital,wght@${upright};${italic}&display=swap`;
  if (loadedUrls.has(url)) return;
  loadedUrls.add(url);
  await new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => {
      const fonts = (document as any).fonts;
      if (fonts?.ready) {
        fonts.ready.then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export async function ensureFontFamilyLoaded(fontFamily: string, fallbackWeights?: number[]) {
  const option = findFontOption(fontFamily);
  if (option) {
    await ensureFontLoaded(option);
    return;
  }
  if (!fallbackWeights?.length) return;
  const temp: FontOption = {
    id: `custom-${fontFamily}`,
    label: fontFamily,
    family: normalizeFontName(fontFamily),
    weights: fallbackWeights,
  };
  await ensureFontLoaded(temp);
}
