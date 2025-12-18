import React from "react";
import { EditorProvider } from "../state/editorStore";
import { EditorShell } from "../editor/EditorShell";
import { ThemeProvider } from "../state/themeStore";

export default function App() {
  return (
    <ThemeProvider>
      <EditorProvider>
        <EditorShell />
      </EditorProvider>
    </ThemeProvider>
  );
}
