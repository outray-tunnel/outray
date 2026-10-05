import { useState, createContext, useContext, useId } from "react";
import { ChevronRight, ChevronDown, ChevronsUpDown } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  initialExpanded?: boolean;
}

const ExpandAllContext = createContext({
  expandAll: false,
  version: 0,
  initialExpanded: true,
});
const toggleClassName =
  "inline-flex size-5 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

function JsonValue({
  value,
  depth = 0,
  path = "root",
}: {
  value: unknown;
  depth?: number;
  path?: string;
}) {
  const { expandAll, version, initialExpanded } = useContext(ExpandAllContext);
  const [state, setState] = useState({
    expanded: initialExpanded && depth < 2,
    version,
  });
  const id = useId();
  // Versioned intent lets a user reopen one node after Expand/Collapse all without
  // a syncing effect immediately closing it again.
  if (state.version !== version) setState({ expanded: expandAll, version });
  const expanded = state.version === version ? state.expanded : expandAll;

  if (value === null || value === undefined)
    return <span className="text-zinc-400">{String(value)}</span>;
  if (typeof value === "boolean")
    return <span className="text-amber-200">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-sky-300">{value}</span>;
  if (typeof value === "string")
    return <span className="text-emerald-300">{JSON.stringify(value)}</span>;
  if (typeof value !== "object")
    return <span className="text-zinc-300">{String(value)}</span>;

  const array = Array.isArray(value);
  const entries: Array<[string, unknown]> = array
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const open = array ? "[" : "{";
  const close = array ? "]" : "}";
  if (entries.length === 0)
    return (
      <span className="text-zinc-300">
        {open}
        {close}
      </span>
    );
  const kind = array ? "array" : "object";

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-1">
        <button
          type="button"
          onClick={() => setState({ expanded: !expanded, version })}
          className={toggleClassName}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${kind} at ${path}`}
          aria-expanded={expanded}
          aria-controls={expanded ? id : undefined}
        >
          {expanded ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>
        <span className="text-zinc-300">{open}</span>
        {!expanded && (
          <>
            <span className="text-zinc-400">
              {entries.length} {array ? "item" : "key"}
              {entries.length === 1 ? "" : "s"}
            </span>
            <span className="text-zinc-300">{close}</span>
          </>
        )}
      </div>
      {expanded && (
        <>
          <div id={id} className="ml-2.5 border-l border-white/[0.08] pl-3">
            {entries.map(([key, item], index) => (
              <div
                key={key}
                className="flex min-w-0 items-start gap-1.5 py-0.5"
              >
                <span
                  className={`shrink-0 ${array ? "select-none text-zinc-400" : "text-zinc-300"}`}
                >
                  {array ? key : JSON.stringify(key)}:
                </span>
                <div className="min-w-0 flex-1">
                  <JsonValue
                    value={item}
                    depth={depth + 1}
                    path={array ? `${path}[${key}]` : `${path}.${key}`}
                  />
                  {index < entries.length - 1 && (
                    <span className="text-zinc-400">,</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <span className="text-zinc-300">{close}</span>
        </>
      )}
    </div>
  );
}

export function JsonViewer({ data, initialExpanded = true }: JsonViewerProps) {
  const [expandAll, setExpandAll] = useState(false);
  const [version, setVersion] = useState(0);
  const expandable =
    typeof data === "object" && data !== null && Object.keys(data).length > 0;
  return (
    <div className="min-w-0">
      {expandable && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setExpandAll(!expandAll);
              setVersion((value) => value + 1);
            }}
            className="inline-flex min-h-7 items-center gap-1.5 rounded px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            aria-label={
              expandAll ? "Collapse all JSON fields" : "Expand all JSON fields"
            }
          >
            <ChevronsUpDown size={12} aria-hidden="true" />
            {expandAll ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}
      <ExpandAllContext.Provider
        value={{ expandAll, version, initialExpanded }}
      >
        <div className="whitespace-pre-wrap font-mono text-[12px] leading-5 [overflow-wrap:anywhere]">
          <JsonValue value={data} />
        </div>
      </ExpandAllContext.Provider>
    </div>
  );
}

export function formatBody(body: string | null): {
  isJson: boolean;
  parsed: unknown;
  formatted: string;
} {
  if (body === null || body === "")
    return { isJson: false, parsed: null, formatted: "" };
  try {
    const parsed = JSON.parse(body);
    return { isJson: true, parsed, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { isJson: false, parsed: null, formatted: body };
  }
}
