import { legacyIncidentDocument, renderIncidentHtml, type IncidentDocument } from "@outray/incident-content";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting } from "lucide-react";
import { useEffect, useState } from "react";
import { UptimeDialog } from "./uptime-dialog";
import { primaryButton, secondaryButton } from "./uptime-ui";

export function IncidentRichEditor({ initialBody, initialNote = "", onChange, disabled = false, id, invalid = false }: {
  initialBody?: IncidentDocument | null;
  initialNote?: string;
  onChange: (body: IncidentDocument) => void;
  disabled?: boolean;
  id: string;
  invalid?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, horizontalRule: false, strike: false, underline: false })],
    content: initialBody ?? legacyIncidentDocument(initialNote),
    immediatelyRender: false,
    editable: !disabled,
    editorProps: { attributes: { id, role: "textbox", "aria-label": "Incident update", "aria-multiline": "true", class: "min-h-32 px-3 py-3 text-[13px] leading-6 text-zinc-200 outline-none [&_p]:my-1 [&_h2]:my-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_a]:text-violet-300 [&_a]:underline" } },
    onUpdate: ({ editor }) => { onChange(editor.getJSON() as IncidentDocument); setRevision((value) => value + 1); },
    onSelectionUpdate: () => setRevision((value) => value + 1),
  });

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  void revision;

  const openLink = () => {
    setLink(editor?.getAttributes("link").href || "");
    setLinkError("");
    setLinkOpen(true);
  };
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
  const tools = [
    { label: "Bold", icon: Bold, active: editor?.isActive("bold"), run: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: editor?.isActive("italic"), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Heading", icon: Heading2, active: editor?.isActive("heading", { level: 2 }), run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bulleted list", icon: List, active: editor?.isActive("bulletList"), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: editor?.isActive("orderedList"), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "Quote", icon: Quote, active: editor?.isActive("blockquote"), run: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: "Link", icon: Link2, active: editor?.isActive("link"), run: openLink },
    { label: "Clear formatting", icon: RemoveFormatting, active: false, run: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
  ];

  return <>
    <div className={`mt-2 overflow-hidden rounded-xl border bg-[#0b0b0d] focus-within:border-violet-400/50 ${invalid ? "border-rose-400/60" : "border-white/[0.1]"}`}>
      <div role="toolbar" aria-label="Format incident update" className="flex flex-wrap gap-1 border-b border-white/[0.08] p-1.5">
        {tools.map((tool) => <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} aria-pressed={!!tool.active} disabled={!editor || disabled} onMouseDown={(event) => event.preventDefault()} onClick={tool.run} className={`flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 disabled:opacity-35 ${tool.active ? "bg-violet-400/15 text-violet-200" : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"}`}><tool.icon size={15} strokeWidth={1.8} aria-hidden="true" /></button>)}
      </div>
      <EditorContent editor={editor} />
    </div>
    <UptimeDialog open={linkOpen} onClose={() => setLinkOpen(false)} title="Add a link" footer={<><button type="button" className={secondaryButton} onClick={() => setLinkOpen(false)}>Cancel</button><button type="button" className={primaryButton} onClick={applyLink}>Apply link</button></>}>
      <label className="block text-[13px] text-zinc-300" htmlFor={`${id}-link`}>URL</label>
      <input id={`${id}-link`} data-autofocus type="url" value={link} onChange={(event) => { setLink(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }} placeholder="https://example.com" className="mt-2 h-10 w-full rounded-lg border border-white/[0.12] bg-black px-3 text-[13px] text-zinc-200 outline-none focus:border-violet-400/50" />
      {linkError && <p role="alert" className="mt-2 text-xs text-rose-300">{linkError}</p>}
    </UptimeDialog>
  </>;
}

export function IncidentRichContent({ body, note }: { body?: IncidentDocument | null; note: string }) {
  return <div className="mt-3 break-words text-[13px] leading-6 text-zinc-400 [&_a]:text-violet-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-zinc-200 [&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-zinc-200 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: renderIncidentHtml(body, note) }} />;
}
