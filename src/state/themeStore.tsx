import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeId = "purple" | "blue" | "pink" | "black" | "white";

type ThemeOption = {
  id: ThemeId;
  label: string;
};

const themeOptions: ThemeOption[] = [
  { id: "purple", label: "Purple" },
  { id: "blue", label: "Blue" },
  { id: "pink", label: "Pink pastel" },
  { id: "black", label: "Black" },
  { id: "white", label: "White" },
];

type ThemeContextValue = {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  options: ThemeOption[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>("pink");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
  }, [themeId]);

  const value = useMemo(() => ({ themeId, setThemeId, options: themeOptions }), [themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
