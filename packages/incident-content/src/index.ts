export type IncidentMark = { type: "bold" | "italic" } | { type: "link"; attrs: { href: string } };
export type IncidentNode = {
  type: "paragraph" | "heading" | "blockquote" | "bulletList" | "orderedList" | "listItem" | "text" | "hardBreak";
  attrs?: { level: 2 | 3 };
  text?: string;
  marks?: IncidentMark[];
  content?: IncidentNode[];
};
export type IncidentDocument = { type: "doc"; content: IncidentNode[] };

const maxPlainLength = 4_000;
const maxJsonLength = 32_000;
const maxNodes = 250;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function parseMarks(value: unknown): IncidentMark[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) return null;
  const marks: IncidentMark[] = [];
  for (const item of value) {
    if (!record(item) || typeof item.type !== "string") return null;
    if ((item.type === "bold" || item.type === "italic") && keys(item, ["type"])) {
      if (marks.some((mark) => mark.type === item.type)) return null;
      marks.push({ type: item.type });
    } else if (item.type === "link" && keys(item, ["type", "attrs"]) && record(item.attrs) && keys(item.attrs, ["href", "target", "rel", "class"])) {
      const href = safeLink(item.attrs.href);
      if (!href || marks.some((mark) => mark.type === "link")) return null;
      marks.push({ type: "link", attrs: { href } });
    } else return null;
  }
  return marks;
}

function parseNode(input: unknown, parent: string, depth: number, count: { value: number }): IncidentNode | null {
  if (!record(input) || depth > 8 || ++count.value > maxNodes || typeof input.type !== "string") return null;
  const type = input.type;
  const inline = parent === "paragraph" || parent === "heading";
  if (type === "text" && inline && keys(input, ["type", "text", "marks"]) && typeof input.text === "string") {
    const marks = parseMarks(input.marks);
    if (!marks || input.text.length > maxPlainLength) return null;
    return { type: "text", text: input.text, ...(marks.length ? { marks } : {}) };
  }
  if (type === "hardBreak" && inline && keys(input, ["type"])) return { type: "hardBreak" };
  const children = input.content ?? [];
  if (!keys(input, ["type", "content", "attrs"]) || !Array.isArray(children) || children.length > maxNodes) return null;
  const allowed = parent === "doc" ? ["paragraph", "heading", "blockquote", "bulletList", "orderedList"]
    : parent === "blockquote" || parent === "listItem" ? ["paragraph", "bulletList", "orderedList"]
      : parent === "bulletList" || parent === "orderedList" ? ["listItem"] : [];
  if (!allowed.includes(type)) return null;
  if (type === "heading") {
    if (!record(input.attrs) || !keys(input.attrs, ["level"]) || ![2, 3].includes(input.attrs.level as number)) return null;
  } else if (input.attrs !== undefined && (!record(input.attrs) || !keys(input.attrs, type === "orderedList" ? ["start", "type"] : ["type"]))) return null;
  if (type === "orderedList" && record(input.attrs) && input.attrs.start !== undefined && input.attrs.start !== 1) return null;
  if (record(input.attrs) && input.attrs.type !== undefined && input.attrs.type !== null) return null;
  const content = children.map((child) => parseNode(child, type, depth + 1, count));
  if (content.some((child) => child === null)) return null;
  return { type: type as IncidentNode["type"], ...(type === "heading" ? { attrs: { level: input.attrs!.level as 2 | 3 } } : {}), content: content as IncidentNode[] };
}

export function incidentPlainText(body: IncidentDocument): string {
  const walk = (node: IncidentDocument | IncidentNode): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    const children = node.content?.map(walk) ?? [];
    return ["doc", "blockquote", "bulletList", "orderedList", "listItem"].includes(node.type)
      ? children.join("\n") : children.join("");
  };
  return walk(body).trim();
}

export function parseIncidentDocument(value: unknown): { body: IncidentDocument; note: string } | null {
  if (!record(value) || value.type !== "doc" || !keys(value, ["type", "content"]) || !Array.isArray(value.content)) return null;
  if (JSON.stringify(value).length > maxJsonLength || value.content.length > maxNodes) return null;
  const count = { value: 0 };
  const content = value.content.map((node) => parseNode(node, "doc", 0, count));
  if (content.some((node) => node === null)) return null;
  const body: IncidentDocument = { type: "doc", content: content as IncidentNode[] };
  const note = incidentPlainText(body);
  return note.length > 0 && note.length <= maxPlainLength ? { body, note } : null;
}

export function legacyIncidentDocument(note: string): IncidentDocument {
  return { type: "doc", content: note.split(/\r?\n/).map((line) => ({
    type: "paragraph" as const, content: line ? [{ type: "text" as const, text: line }] : [],
  })) };
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function renderNode(node: IncidentNode): string {
  if (node.type === "text") {
    let text = escapeHtml(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      if (mark.type === "italic") text = `<em>${text}</em>`;
      if (mark.type === "link") text = `<a href="${escapeHtml(mark.attrs.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "<br>";
  const children = (node.content ?? []).map(renderNode).join("");
  const tag = node.type === "heading" ? `h${node.attrs!.level}`
    : node.type === "bulletList" ? "ul" : node.type === "orderedList" ? "ol"
      : node.type === "listItem" ? "li" : node.type === "blockquote" ? "blockquote" : "p";
  return `<${tag}>${children}</${tag}>`;
}

export function renderIncidentHtml(body: unknown, fallbackNote: string): string {
  const parsed = body === null || body === undefined ? null : parseIncidentDocument(body);
  if (parsed) return parsed.body.content.map(renderNode).join("");
  return fallbackNote.split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}
