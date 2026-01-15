import { Copy, Check } from "lucide-react";
import type { TunnelEvent, RequestDetails } from "./types";
import { JsonViewer, formatBody } from "./json-viewer";

interface RequestTabContentProps {
  request: TunnelEvent;
  details: RequestDetails;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}

export function RequestTabContent({
  request,
  details,
  copiedField,
  onCopy,
}: RequestTabContentProps) {
  const formatHeaderValue = (value: string | string[]): string => {
    return Array.isArray(value) ? value.join(", ") : value;
  };

  const bodyInfo = formatBody(details.body);

  return (
    <div className="space-y-4">
      {/* General Info */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-medium text-white">General</span>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">URL</span>
            <span className="text-gray-300 font-mono">
              {request.host.includes("localhost") ? "http" : "https"}://
              {request.host}
              {request.path}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Method</span>
            <span className="text-gray-300 font-mono">{request.method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Client IP</span>
            <span className="text-gray-300 font-mono">{request.client_ip}</span>
          </div>
        </div>
      </div>

      {/* Headers */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Headers</span>
          <button
            onClick={() =>
              onCopy(JSON.stringify(details.headers, null, 2), "req-headers")
            }
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            {copiedField === "req-headers" ? (
              <Check size={14} />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
        <div className="p-4 space-y-2 text-sm font-mono">
          {Object.entries(details.headers).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-accent">{key}:</span>
              <span className="text-gray-300 break-all">
                {formatHeaderValue(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Query Params */}
      {Object.keys(details.queryParams).length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <span className="text-sm font-medium text-white">
              Query Parameters
            </span>
          </div>
          <div className="p-4 space-y-2 text-sm font-mono">
            {Object.entries(details.queryParams).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-accent">{key}:</span>
                <span className="text-gray-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {details.body && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">Body</span>
              {bodyInfo.isJson && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                  JSON
                </span>
              )}
            </div>
            <button
              onClick={() =>
                onCopy(
                  bodyInfo.isJson ? bodyInfo.formatted : details.body!,
                  "req-body",
                )
              }
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              {copiedField === "req-body" ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
          <div className="p-4 overflow-x-auto">
            {bodyInfo.isJson ? (
              <JsonViewer data={bodyInfo.parsed} />
            ) : (
              <pre className="text-sm font-mono text-gray-300">
                {details.body}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
