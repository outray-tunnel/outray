import { legacyIncidentDocument, renderIncidentHtml, type IncidentDocument } from "@outray/incident-content";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceInput } from "@/components/ui/workspace-input";
import { Button } from "@/components/arc/button/button";
import { UptimeDialog } from "./uptime-dialog";
import { incidentFormatSnapshot } from "./incident-editor-state";

const incidentExtensions = [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: false, linkOnPaste: false }, codeBlock: false, horizontalRule: false, strike: false, underline: false })];

const selectIncidentFormat = ({ editor }: { editor: Editor | null }) => incidentFormatSnapshot(editor);

const IncidentFormattingToolbar = memo(function IncidentFormattingToolbar({ editor, disabled, onLink }: {
  editor: Editor | null;
  disabled: boolean;
  onLink: () => void;
}) {
  const format = useEditorState({ editor, selector: selectIncidentFormat }) ?? 0;
  const tools = [
    { label: "Bold", icon: Bold, active: !!(format & 1), run: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: !!(format & 2), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Heading", icon: Heading2, active: !!(format & 4), run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Small heading", icon: Heading3, active: !!(format & 8), run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Bulleted list", icon: List, active: !!(format & 16), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: !!(format & 32), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "Quote", icon: Quote, active: !!(format & 64), run: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: "Link", icon: Link2, active: !!(format & 128), run: onLink },
    { label: "Clear formatting", icon: RemoveFormatting, active: false, run: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
  ];
  return <div role="toolbar" aria-label="Format incident update" className="flex flex-wrap gap-0.5 border-b border-white/[0.07] bg-white/[0.015] p-1.5">
    {tools.map((tool) => <Button key={tool.label} variant="ghost" size="sm" type="button" title={tool.label} aria-label={tool.label} aria-pressed={tool.active} disabled={!editor || disabled} onMouseDown={(event) => event.preventDefault()} onClick={tool.run} className={`!size-8 !min-w-0 !px-0 ${tool.active ? "!bg-white/[0.08] !text-zinc-100" : "!text-zinc-400"}`}><tool.icon size={14} strokeWidth={1.7} aria-hidden="true" /></Button>)}
  </div>;
});

export const IncidentRichEditor = memo(function IncidentRichEditor({ initialBody, initialNote = "", onChange, disabled = false, id, invalid = false }: {
  initialBody?: IncidentDocument | null;
  initialNote?: string;
  onChange: (body: IncidentDocument) => void;
  disabled?: boolean;
  id: string;
  invalid?: boolean;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const [content] = useState(() => initialBody ?? legacyIncidentDocument(initialNote));
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onUpdate = useCallback(({ editor }: { editor: Editor }) => {
    onChangeRef.current(editor.getJSON() as IncidentDocument);
  }, []);
  const editorProps = useMemo(() => ({ attributes: { id, role: "textbox", "aria-label": "Incident update", "aria-multiline": "true", class: "min-h-36 px-3.5 py-3 text-[13px] leading-6 text-zinc-200 outline-none [&_p]:my-1 [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-medium [&_h3]:my-2 [&_h3]:text-[13px] [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_a]:text-violet-300 [&_a]:underline" } }), [id]);
  const editor = useEditor({
    extensions: incidentExtensions,
    content,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    editorProps,
    onUpdate,
  });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-invalid", String(invalid));
    if (invalid) editor.view.dom.setAttribute("aria-describedby", `${id}-error`);
    else editor.view.dom.removeAttribute("aria-describedby");
  }, [editor, id, invalid]);
  const openLink = useCallback(() => {
    setLink(editor?.getAttributes("link").href || "");
    setLinkError("");
    setLinkOpen(true);
  }, [editor]);
  const applyLink = () => {
    if (!editor) return;
    if (!link.trim()) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); return; }
    try {
      const url = new URL(link.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsafe");
      editor.chain().focus().extendMarkRange("link").setLink({ href: url.href }).run();
      setLinkOpen(false);
    } catch { setLinkError("Enter a valid http:// or https:// URL."); }
  };
  return <>
    <div className={`mt-2 overflow-hidden rounded-xl border bg-white/[0.015] transition-colors focus-within:border-white/25 motion-reduce:transition-none ${invalid ? "border-rose-400/60" : "border-white/[0.1]"}`}>
      <IncidentFormattingToolbar editor={editor} disabled={disabled} onLink={openLink} />
      <EditorContent editor={editor} />
    </div>
    <UptimeDialog open={linkOpen} onClose={() => setLinkOpen(false)} title="Add a link" footer={<><Button type="button" variant="secondary" size="sm" onClick={() => setLinkOpen(false)}>Cancel</Button><Button type="button" size="sm" onClick={applyLink}>Apply link</Button></>}>
      <label className="block text-[13px] text-zinc-300" htmlFor={`${id}-link`}>URL</label>
      <WorkspaceInput id={`${id}-link`} data-autofocus type="url" size="compact" value={link} onChange={(event) => { setLink(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }} placeholder="https://example.com" aria-invalid={!!linkError} aria-describedby={linkError ? `${id}-link-error` : undefined} className="mt-2" />
      {linkError && <p id={`${id}-link-error`} role="alert" className="mt-2 text-xs text-rose-300">{linkError}</p>}
    </UptimeDialog>
  </>;
});

export function IncidentRichContent({ body, note }: { body?: IncidentDocument | null; note: string }) {
  return <div className="mt-3 break-words text-[13px] leading-6 text-zinc-400 [&_a]:text-violet-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-zinc-200 [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-zinc-200 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: renderIncidentHtml(body, note) }} />;
}
