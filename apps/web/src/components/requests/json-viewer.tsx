import { useState, createContext, useContext, useEffect } from "react";
import { ChevronRight, ChevronDown, ChevronsUpDown } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  initialExpanded?: boolean;
}

const ExpandAllContext = createContext<{ expandAll: boolean; version: number }>(
  { expandAll: false, version: 0 },
);

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const { expandAll, version } = useContext(ExpandAllContext);
  const [expanded, setExpanded] = useState(depth < 2);

  // Sync with expand all toggle
  useEffect(() => {
    if (version > 0) {
      setExpanded(expandAll);
    }
  }, [expandAll, version]);

  if (value === null) {
    return <span className="text-gray-500">null</span>;
  }

  if (value === undefined) {
    return <span className="text-gray-500">undefined</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-amber-400">{value.toString()}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-blue-400">{value}</span>;
  }

  if (typeof value === "string") {
    if (value.match(/^https?:\/\//)) {
      return <span className="text-green-400">"{value}"</span>;
    }
    if (value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return <span className="text-green-400">"{value}"</span>;
    }
    if (value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return <span className="text-purple-400">"{value}"</span>;
    }
    return <span className="text-green-400">"{value}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400">[]</span>;
    }

    if (!expanded) {
      return (
        <span>
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center text-gray-500 hover:text-gray-300"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-gray-400">[</span>
          <span className="text-gray-500"> {value.length} items </span>
          <span className="text-gray-400">]</span>
        </span>
      );
    }

    return (
      <div>
        <span>
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center text-gray-500 hover:text-gray-300"
          >
            <ChevronDown size={14} />
          </button>
          <span className="text-gray-400">[</span>
        </span>
        <div className="ml-4 border-l border-white/10 pl-2">
          {value.map((item, index) => (
            <div key={index} className="flex">
              <span className="text-gray-600 mr-2 select-none">{index}:</span>
              <span className="flex-1">
                <JsonValue value={item} depth={depth + 1} />
                {index < value.length - 1 && (
                  <span className="text-gray-500">,</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <span className="text-gray-400">]</span>
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-gray-400">{"{}"}</span>;
    }

    if (!expanded) {
      return (
        <span>
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center text-gray-500 hover:text-gray-300"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-gray-400">{"{"}</span>
          <span className="text-gray-500"> {entries.length} keys </span>
          <span className="text-gray-400">{"}"}</span>
        </span>
      );
    }

    return (
      <div>
        <span>
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center text-gray-500 hover:text-gray-300"
          >
            <ChevronDown size={14} />
          </button>
          <span className="text-gray-400">{"{"}</span>
        </span>
        <div className="ml-4 border-l border-white/10 pl-2">
          {entries.map(([key, val], index) => (
            <div key={key} className="flex flex-wrap">
              <span className="text-accent">"{key}"</span>
              <span className="text-gray-500 mx-1">:</span>
              <span className="flex-1">
                <JsonValue value={val} depth={depth + 1} />
                {index < entries.length - 1 && (
                  <span className="text-gray-500">,</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <span className="text-gray-400">{"}"}</span>
      </div>
    );
  }

  return <span className="text-gray-300">{String(value)}</span>;
}

export function JsonViewer({ data }: JsonViewerProps) {
  const [expandAll, setExpandAll] = useState(false);
  const [version, setVersion] = useState(0);

  const toggleExpandAll = () => {
    setExpandAll(!expandAll);
    setVersion((v) => v + 1);
  };

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={toggleExpandAll}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
        >
          <ChevronsUpDown size={12} />
          {expandAll ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ExpandAllContext.Provider value={{ expandAll, version }}>
        <div className="font-mono text-sm leading-relaxed">
          <JsonValue value={data} depth={0} />
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
  if (!body) {
    return { isJson: false, parsed: null, formatted: "" };
  }

  try {
    const parsed = JSON.parse(body);
    return { isJson: true, parsed, formatted: JSON.stringify(parsed, null, 2) };
  } catch {
    return { isJson: false, parsed: null, formatted: body };
  }
}
