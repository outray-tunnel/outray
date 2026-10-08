import type { Editor } from "@tiptap/react";

// Ignore caret positions and text transactions when toolbar formatting is unchanged.
export function incidentFormatSnapshot(editor: Pick<Editor, "isActive"> | null): number {
  if (!editor) return 0;
  return (editor.isActive("bold") ? 1 : 0)
    | (editor.isActive("italic") ? 2 : 0)
    | (editor.isActive("heading", { level: 2 }) ? 4 : 0)
    | (editor.isActive("heading", { level: 3 }) ? 8 : 0)
    | (editor.isActive("bulletList") ? 16 : 0)
    | (editor.isActive("orderedList") ? 32 : 0)
    | (editor.isActive("blockquote") ? 64 : 0)
    | (editor.isActive("link") ? 128 : 0);
}
