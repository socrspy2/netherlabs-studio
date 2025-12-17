import React from "react";
import { EditorProvider } from "../state/editorStore";
import { EditorShell } from "../editor/EditorShell";

export default function App() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
