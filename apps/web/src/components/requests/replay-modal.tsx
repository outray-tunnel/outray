import { useState, useEffect, useRef } from "react";
import {
  X,
  Play,
  Loader2,
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  FileText,
  ListTree,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { TunnelEvent, RequestCapture } from "./types";
import { JsonViewer, formatBody } from "./json-viewer";

type RequestTab = "headers" | "body";

interface ReplayResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | null;
  duration: number;
}

interface ReplayModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: TunnelEvent;
  capture: RequestCapture;
  orgSlug: string;
}

export function ReplayModal({
  isOpen,
  onClose,
  request,
  capture,
  orgSlug,
}: ReplayModalProps) {
  const [replaying, setReplaying] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestTab>("headers");

  // Editable request state
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState(request.method);
  const [headers, setHeaders] = useState<
    Array<{ key: string; value: string; enabled: boolean }>
  >([]);
  const [body, setBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Store original values for reset
  const [originalState, setOriginalState] = useState<{
    url: string;
    method: string;
    headers: Array<{ key: string; value: string; enabled: boolean }>;
    body: string;
  } | null>(null);

  const hasBody = !["GET", "HEAD"].includes(method);

  // Ref for scrolling to result
  const resultRef = useRef<HTMLDivElement>(null);

  // Initialize editable state from capture
  useEffect(() => {
    if (isOpen && capture) {
      const protocol = request.host.includes("localhost") ? "http" : "https";
      const initialUrl = `${protocol}://${request.host}${request.path}`;
      setUrl(initialUrl);
      setMethod(request.method);

      const excludeHeaders = [
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
      ];
      const headerList = Object.entries(capture.request.headers)
        .filter(([key]) => !excludeHeaders.includes(key.toLowerCase()))
        .map(([key, value]) => ({
          key,
          value: Array.isArray(value) ? value.join(", ") : value,
          enabled: true,
        }));
      setHeaders(headerList);
      const initialBody = capture.request.body || "";
      setBody(initialBody);
      setResult(null);
      setError(null);
      setIsEditing(false);
      setActiveTab("headers");

      // Store original state for reset
      setOriginalState({
        url: initialUrl,
        method: request.method,
        headers: headerList,
        body: initialBody,
      });
    }
  }, [isOpen, capture, request]);

  const cancelEdit = () => {
    if (originalState) {
      setUrl(originalState.url);
      setMethod(originalState.method);
      setHeaders(originalState.headers.map((h) => ({ ...h })));
      setBody(originalState.body);
    }
    setIsEditing(false);
  };

  const handleReplay = async () => {
    setReplaying(true);
    setError(null);
    setResult(null);

    try {
      const requestHeaders: Record<string, string> = {};
      headers
        .filter((h) => h.enabled && h.key)
        .forEach((h) => {
          requestHeaders[h.key] = h.value;
        });

      // Use the proxy endpoint to avoid CORS issues
      const response = await fetch(
        `/api/${encodeURIComponent(orgSlug)}/requests/replay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            method,
            headers: requestHeaders,
            requestBody: ["GET", "HEAD"].includes(method)
              ? undefined
              : body || undefined,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to replay request");
      }

      setResult({
        status: data.status,
        statusText: data.statusText,
        headers: data.headers,
        body: data.body,
        duration: data.duration,
      });

      // Scroll to result after a short delay to let it render
      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to replay request");
    } finally {
      setReplaying(false);
    }
  };

  const addHeader = () => {
    setHeaders([...headers, { key: "", value: "", enabled: true }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const updateHeader = (
    index: number,
    field: "key" | "value" | "enabled",
    value: string | boolean,
  ) => {
    const newHeaders = [...headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setHeaders(newHeaders);
  };

  const getStatusColor = (status: number) => {
    if (status >= 500) return "text-red-400 bg-red-500/10 border-red-500/20";
    if (status >= 400)
      return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    if (status >= 300) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    return "text-green-400 bg-green-500/10 border-green-500/20";
  };

  const bodyInfo = result?.body ? formatBody(result.body) : null;

  const tabs = [
    {
      id: "headers" as RequestTab,
      label: "Headers",
      icon: ListTree,
      count: headers.filter((h) => h.enabled).length,
    },
    {
      id: "body" as RequestTab,
      label: "Body",
      icon: FileText,
      count: body ? 1 : 0,
    },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[85vh] bg-[#0A0A0A] border border-white/10 rounded-2xl z-[60] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Play size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="text-white font-medium">Replay Request</h2>
              <p className="text-gray-500 text-sm">
                Modify and resend the request
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 text-gray-400 hover:text-white border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-accent/20 text-accent border border-accent/30 transition-colors"
                >
                  Done
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 text-gray-400 hover:text-white border border-white/10 transition-colors"
              >
                <Edit3 size={14} />
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* URL and Method */}
        <div className="p-4 border-b border-white/10 space-y-2">
          <div className="flex gap-2">
            {isEditing ? (
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-accent/50"
              >
                {[
                  "GET",
                  "POST",
                  "PUT",
                  "PATCH",
                  "DELETE",
                  "HEAD",
                  "OPTIONS",
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono">
                {method}
              </div>
            )}
            {isEditing ? (
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-accent/50"
                placeholder="https://..."
              />
            ) : (
              <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-300 font-mono truncate">
                {url}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 bg-white/2">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              disabled={id === "body" && !hasBody}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-white/10 text-white"
                  : id === "body" && !hasBody
                    ? "text-gray-600 cursor-not-allowed"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={16} />
              {label}
              {count > 0 && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    activeTab === id ? "bg-white/20" : "bg-white/10"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
          {isEditing && activeTab === "headers" && (
            <button
              onClick={addHeader}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Add Header
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Headers Tab */}
          {activeTab === "headers" && (
            <div className="space-y-2">
              {headers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ListTree size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No headers</p>
                  {isEditing && (
                    <button
                      onClick={addHeader}
                      className="mt-2 text-accent hover:underline text-sm"
                    >
                      Add a header
                    </button>
                  )}
                </div>
              ) : (
                headers.map((header, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 bg-white/5 rounded-lg p-2 border border-white/10"
                  >
                    {isEditing && (
                      <input
                        type="checkbox"
                        checked={header.enabled}
                        onChange={(e) =>
                          updateHeader(index, "enabled", e.target.checked)
                        }
                        className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent/50"
                      />
                    )}
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={header.key}
                          onChange={(e) =>
                            updateHeader(index, "key", e.target.value)
                          }
                          placeholder="Header name"
                          className="w-1/3 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-accent font-mono focus:outline-none focus:border-accent/50"
                        />
                        <input
                          type="text"
                          value={header.value}
                          onChange={(e) =>
                            updateHeader(index, "value", e.target.value)
                          }
                          placeholder="Value"
                          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-gray-300 font-mono focus:outline-none focus:border-accent/50"
                        />
                        <button
                          onClick={() => removeHeader(index)}
                          className="p-1.5 hover:bg-red-500/10 rounded transition-colors text-gray-500 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <div
                        className={`flex gap-2 text-sm font-mono flex-1 ${!header.enabled ? "opacity-40" : ""}`}
                      >
                        <span className="text-accent">{header.key}:</span>
                        <span className="text-gray-300 break-all">
                          {header.value}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Body Tab */}
          {activeTab === "body" && hasBody && (
            <div>
              {isEditing ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono focus:outline-none focus:border-accent/50 resize-none"
                  placeholder="Request body..."
                />
              ) : body ? (
                (() => {
                  const bodyFormatted = formatBody(body);
                  return (
                    <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                      {bodyFormatted.isJson ? (
                        <JsonViewer data={bodyFormatted.parsed} />
                      ) : (
                        <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
                          {body}
                        </pre>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No body</p>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <XCircle size={20} className="text-red-400 mt-0.5" />
                <div>
                  <p className="text-red-300 font-medium">Request Failed</p>
                  <p className="text-red-400/80 text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div ref={resultRef} className="space-y-4">
              {/* Response summary */}
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex-1">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                    Original
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-sm font-medium border ${getStatusColor(request.status_code)}`}
                    >
                      {request.status_code}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {request.request_duration_ms}ms
                    </span>
                  </div>
                </div>
                <ArrowRight size={20} className="text-gray-600" />
                <div className="flex-1">
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                    Replay
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-sm font-medium border ${getStatusColor(result.status)}`}
                    >
                      {result.status}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {result.duration}ms
                    </span>
                    {result.status === request.status_code ? (
                      <CheckCircle2 size={16} className="text-green-400" />
                    ) : (
                      <AlertCircle size={16} className="text-orange-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Status change warning */}
              {result.status !== request.status_code && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={20} className="text-orange-400 mt-0.5" />
                    <div>
                      <p className="text-orange-300 font-medium">
                        Status Code Changed
                      </p>
                      <p className="text-orange-400/80 text-sm mt-1">
                        Original returned {request.status_code}, replay returned{" "}
                        {result.status}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Response Headers */}
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                  <span className="text-sm font-medium text-white">
                    Response Headers
                  </span>
                </div>
                <div className="p-4 space-y-2 text-sm font-mono max-h-48 overflow-y-auto">
                  {Object.entries(result.headers).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-accent">{key}:</span>
                      <span className="text-gray-300 break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response Body */}
              {result.body && (
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      Response Body
                    </span>
                    {bodyInfo?.isJson && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                        JSON
                      </span>
                    )}
                  </div>
                  <div className="p-4 overflow-x-auto max-h-64 overflow-y-auto">
                    {bodyInfo?.isJson ? (
                      <JsonViewer data={bodyInfo.parsed} />
                    ) : (
                      <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
                        {result.body}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock size={12} />
              <span>Request will be sent directly from your browser</span>
            </div>
            <button
              onClick={handleReplay}
              disabled={replaying || !url}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent/90 disabled:bg-accent/50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              {replaying ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Play size={18} />
                  Send Request
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
