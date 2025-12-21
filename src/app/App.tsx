import React from "react";
import { EditorProvider } from "../state/editorStore";
import { AssetProvider } from "../state/assetStore";
import { EditorShell } from "../editor/EditorShell";
import { ThemeProvider } from "../state/themeStore";

export default function App() {
  return (
    <ThemeProvider>
      <AssetProvider>
        <EditorProvider>
          <EditorShell />
        </EditorProvider>
      </AssetProvider>
    </ThemeProvider>
  );
}
