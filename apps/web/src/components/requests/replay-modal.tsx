import { type ReactNode, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Clock01Icon from "@hugeicons-pro/core-stroke-rounded/Clock01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Edit02Icon from "@hugeicons-pro/core-stroke-rounded/Edit02Icon";
import ReplayIcon from "@hugeicons-pro/core-stroke-rounded/ReplayIcon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import type { RequestCapture, TunnelEvent } from "./types";
import { formatBody, JsonViewer } from "./json-viewer";
import { getHttpMethodColor } from "./utils";
import { requestInspectorUrl } from "./request-inspector-data";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { Select } from "../ui/select";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import "../outray-arc-theme.css";
import styles from "./replay-modal.module.css";

type RequestTab = "headers" | "body";

type EditableHeader = {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
};

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function MethodDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (method: string) => void;
  disabled: boolean;
}) {
  return (
    <Select
      ariaLabel="Request method"
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-28 shrink-0"
      triggerClassName="h-11 font-mono"
      options={Array.from(new Set([...HTTP_METHODS, value])).map((method) => ({
        value: method,
        label: method,
        className: getHttpMethodColor(method),
      }))}
    />
  );
}

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
  const reducedMotion = useReducedMotion();
  const [replaying, setReplaying] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RequestTab>("headers");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState(request.method);
  const [headers, setHeaders] = useState<EditableHeader[]>([]);
  const [body, setBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [originalState, setOriginalState] = useState<{
    url: string;
    method: string;
    headers: EditableHeader[];
    body: string;
  } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sending = useRef(false);
  const nextHeaderId = useRef(0);
  const hasBody = !["GET", "HEAD"].includes(method);

  useEffect(() => {
    if (!isOpen || !capture) return;

    const initialUrl = requestInspectorUrl(request);
    const excludedHeaders = [
      "host",
      "content-length",
      "transfer-encoding",
      "connection",
    ];
    const headerList = Object.entries(capture.request.headers ?? {})
      .filter(([key]) => !excludedHeaders.includes(key.toLowerCase()))
      .map(([key, value], index) => ({
        id: index,
        key,
        value: Array.isArray(value) ? value.join(", ") : value,
        enabled: true,
      }));
    const initialBody = capture.request.body || "";
    nextHeaderId.current = headerList.length;

    setUrl(initialUrl);
    setMethod(request.method);
    setHeaders(headerList);
    setBody(initialBody);
    setResult(null);
    setError(null);
    setIsEditing(false);
    setActiveTab("headers");
    setOriginalState({
      url: initialUrl,
      method: request.method,
      headers: headerList,
      body: initialBody,
    });
  }, [isOpen, capture, request]);

  const cancelEdit = () => {
    if (originalState) {
      setUrl(originalState.url);
      setMethod(originalState.method);
      setHeaders(originalState.headers.map((header) => ({ ...header })));
      setBody(originalState.body);
    }
    setIsEditing(false);
  };

  const handleReplay = async () => {
    if (sending.current || !url) return;
    sending.current = true;
    setReplaying(true);
    setError(null);
    setResult(null);

    try {
      const requestHeaders: Record<string, string> = {};
      headers
        .filter((header) => header.enabled && header.key)
        .forEach((header) => {
          requestHeaders[header.key] = header.value;
        });

      const response = await fetch(
        `/api/${encodeURIComponent(orgSlug)}/requests/replay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }, 100);
    } catch (replayError) {
      setError(
        replayError instanceof Error
          ? replayError.message
          : "Failed to replay request",
      );
    } finally {
      sending.current = false;
      setReplaying(false);
    }
  };

  const addHeader = () => {
    const id = nextHeaderId.current++;
    setHeaders((current) => [
      ...current,
      { id, key: "", value: "", enabled: true },
    ]);
  };

  const removeHeader = (index: number) => {
    setHeaders((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const updateHeader = (
    index: number,
    field: "key" | "value" | "enabled",
    value: string | boolean,
  ) => {
    setHeaders((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const statusColor = (status: number) => {
    if (status >= 500) return "text-red-400";
    if (status >= 400) return "text-amber-400";
    if (status >= 300) return "text-sky-400";
    return "text-emerald-400";
  };

  const bodyInfo = result?.body ? formatBody(result.body) : null;
  const tabs = [
    {
      id: "headers" as RequestTab,
      label: "Headers",
      count: headers.filter((header) => header.enabled).length,
    },
    {
      id: "body" as RequestTab,
      label: "Body",
      count: body ? 1 : 0,
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !sending.current) onClose();
    }}>
      <DialogContent
        title="Replay request"
        description="Review, modify, and resend the captured request. Sending may change data in the destination service."
        className={`workspace-ui outray-arc ${styles.content}`}
        overlayClassName={styles.overlay}
        aria-busy={replaying}
        closeDisabled={replaying}
        onEscapeKeyDown={(event) => {
          if (sending.current || (typeof Element !== "undefined" && event.target instanceof Element &&
            event.target.closest('[aria-haspopup="listbox"][aria-expanded="true"]'))) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (sending.current) event.preventDefault();
        }}
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3 sm:px-6">
          <p className="text-[12px] text-zinc-400">{isEditing ? "Editing request" : "Captured request"}</p>
          <div className="flex items-center gap-2" aria-busy={replaying}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={replaying}
                  className="h-8 rounded-md px-3 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={replaying}
                  className="h-8 rounded-md border border-white/[0.1] px-3 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.04]"
                >
                  Done
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={replaying}
                className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] px-3 text-[10px] font-medium text-zinc-500 transition-colors hover:border-white/[0.16] hover:bg-white/[0.03] hover:text-zinc-300"
              >
                <HugeiconsIcon
                  icon={Edit02Icon}
                  size={13}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          {isEditing ? (
            <MethodDropdown value={method} disabled={replaying} onChange={(next) => {
              setMethod(next);
              if (["GET", "HEAD"].includes(next)) setActiveTab("headers");
            }} />
          ) : (
            <div
              className={`flex h-11 w-20 shrink-0 items-center font-mono text-[11px] font-semibold ${getHttpMethodColor(method)}`}
            >
              {method}
            </div>
          )}
          {isEditing ? (
            <WorkspaceInput
              type="text"
              aria-label="Request URL"
              disabled={replaying}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="min-w-0 flex-1 font-mono"
              placeholder="https://…"
            />
          ) : (
            <div className="flex h-11 min-w-0 flex-1 items-center truncate border-b border-white/[0.07] font-mono text-[11px] text-zinc-500">
              {url}
            </div>
          )}
        </div>

        <nav className="flex h-11 shrink-0 items-end gap-6 border-b border-white/[0.07] px-5 sm:px-6">
          {tabs.map(({ id, label, count }) => {
            const disabled = id === "body" && !hasBody;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                disabled={disabled}
                aria-pressed={activeTab === id}
                className={`flex h-11 items-center gap-2 border-b text-[10px] font-medium transition-colors ${
                  activeTab === id
                    ? "border-white text-zinc-200"
                    : disabled
                      ? "cursor-not-allowed border-transparent text-zinc-800"
                      : "border-transparent text-zinc-700 hover:text-zinc-400"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className="font-mono text-[9px] text-zinc-700">
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {isEditing && activeTab === "headers" && (
            <button
              type="button"
              onClick={addHeader}
              disabled={replaying}
              className="ml-auto mb-2.5 flex h-6 items-center gap-1.5 text-[9px] font-medium text-zinc-600 transition-colors hover:text-zinc-300"
            >
              <HugeiconsIcon
                icon={Add01Icon}
                size={12}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              Add header
            </button>
          )}
        </nav>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-6">
          {activeTab === "headers" && (
            <section className="overflow-hidden rounded-xl border border-white/[0.07] px-4">
              {headers.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs text-zinc-600">No headers</p>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={addHeader}
                      disabled={replaying}
                      className="mt-2 text-[10px] text-zinc-400 hover:text-white"
                    >
                      Add a header
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.055]">
                  {headers.map((header, index) => (
                    <div
                      key={header.id}
                      className="flex min-h-11 items-center gap-3 py-2.5"
                    >
                      {isEditing && (
                        <input
                          type="checkbox"
                          disabled={replaying}
                          checked={header.enabled}
                          onChange={(event) =>
                            updateHeader(index, "enabled", event.target.checked)
                          }
                          className="size-3 accent-white"
                          aria-label={`Include ${header.key || "header"}`}
                        />
                      )}
                      {isEditing ? (
                        <>
                          <WorkspaceInput
                            type="text"
                            aria-label={`Header ${index + 1} name`}
                            disabled={replaying}
                            value={header.key}
                            onChange={(event) =>
                              updateHeader(index, "key", event.target.value)
                            }
                            placeholder="Header name"
                            className="w-2/5 font-mono"
                          />
                          <WorkspaceInput
                            type="text"
                            aria-label={`Header ${index + 1} value`}
                            disabled={replaying}
                            value={header.value}
                            onChange={(event) =>
                              updateHeader(index, "value", event.target.value)
                            }
                            placeholder="Value"
                            className="min-w-0 flex-1 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => removeHeader(index)}
                            disabled={replaying}
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-red-500/[0.06] hover:text-red-400"
                            aria-label={`Remove ${header.key || "header"}`}
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              size={13}
                              strokeWidth={1.7}
                              aria-hidden="true"
                            />
                          </button>
                        </>
                      ) : (
                        <div
                          className={`grid min-w-0 flex-1 grid-cols-[minmax(120px,0.4fr)_1fr] gap-5 ${!header.enabled ? "opacity-35" : ""}`}
                        >
                          <span className="truncate font-mono text-[10px] text-zinc-700">
                            {header.key}
                          </span>
                          <span className="break-all text-right font-mono text-[10px] leading-4 text-zinc-400">
                            {header.value}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "body" && hasBody && (
            <section className="overflow-hidden rounded-xl border border-white/[0.07] p-4">
              {isEditing ? (
                <WorkspaceTextarea
                  aria-label="Request body"
                  disabled={replaying}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={12}
                  className="font-mono"
                  style={{ resize: "none" }}
                  placeholder="Request body…"
                />
              ) : body ? (
                (() => {
                  const formattedBody = formatBody(body);
                  return formattedBody.isJson ? (
                    <JsonViewer data={formattedBody.parsed} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-400">
                      {body}
                    </pre>
                  );
                })()
              ) : (
                <p className="py-8 text-center text-xs text-zinc-700">
                  No request body
                </p>
              )}
            </section>
          )}

          {error && (
            <div id="replay-request-error" role="alert" className="flex items-start gap-2.5 border-l border-red-400/35 py-0.5 pl-3 text-red-300/70">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={13}
                strokeWidth={1.7}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-[10px] font-medium">Request failed</p>
                <p className="mt-1 text-[10px] leading-4 text-red-300/50">
                  {error}
                </p>
              </div>
            </div>
          )}

          {result && (
            <div ref={resultRef} aria-live="polite" className="space-y-7 scroll-mt-6">
              <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-5 overflow-hidden rounded-xl border border-white/[0.07] px-6 py-5">
                <ResultMetric
                  label="Original"
                  status={request.status_code}
                  duration={request.request_duration_ms}
                  statusColor={statusColor(request.status_code)}
                />
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={15}
                  strokeWidth={1.6}
                  className="text-zinc-800"
                  aria-hidden="true"
                />
                <ResultMetric
                  label="Replay"
                  status={result.status}
                  duration={result.duration}
                  statusColor={statusColor(result.status)}
                  matches={result.status === request.status_code}
                />
              </section>

              {result.status !== request.status_code && (
                <div className="flex items-start gap-2.5 border-l border-amber-400/35 py-0.5 pl-3 text-[10px] leading-4 text-amber-200/60">
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={13}
                    strokeWidth={1.7}
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  Status changed from {request.status_code} to {result.status}.
                </div>
              )}

              <ResultSection title="Response headers">
                <div className="max-h-48 divide-y divide-white/[0.055] overflow-y-auto">
                  {Object.entries(result.headers).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(120px,0.4fr)_1fr] gap-5 py-3"
                    >
                      <span className="truncate font-mono text-[10px] text-zinc-700">
                        {key}
                      </span>
                      <span className="break-all text-right font-mono text-[10px] leading-4 text-zinc-400">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </ResultSection>

              {result.body && (
                <ResultSection
                  title="Response body"
                  accessory={
                    bodyInfo?.isJson ? (
                      <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-sky-400/70">
                        JSON
                      </span>
                    ) : null
                  }
                >
                  <div className="max-h-64 overflow-auto py-4">
                    {bodyInfo?.isJson ? (
                      <JsonViewer data={bodyInfo.parsed} />
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-400">
                        {result.body}
                      </pre>
                    )}
                  </div>
                </ResultSection>
              )}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-5 border-t border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-[9px] text-zinc-700">
            <HugeiconsIcon
              icon={Clock01Icon}
              size={12}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            Replay sends a real request
          </div>
          <Button
            type="button"
            onClick={handleReplay}
            disabled={!url}
            loading={replaying}
            size="sm"
            aria-describedby={error ? "replay-request-error" : undefined}
          >
            <HugeiconsIcon
              icon={ReplayIcon}
              size={13}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {replaying ? "Sending…" : "Send request"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ResultMetric({
  label,
  status,
  duration,
  statusColor,
  matches,
}: {
  label: string;
  status: number;
  duration: number;
  statusColor: string;
  matches?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-700">
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2.5">
        <span className={`text-xs font-semibold tabular-nums ${statusColor}`}>
          {status}
        </span>
        <span className="text-[10px] tabular-nums text-zinc-600">
          {duration}ms
        </span>
        {matches && (
          <HugeiconsIcon
            icon={Tick02Icon}
            size={12}
            strokeWidth={1.8}
            className="text-emerald-500"
            aria-label="Status matches"
          />
        )}
      </div>
    </div>
  );
}

function ResultSection({
  title,
  accessory,
  children,
}: {
  title: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.07]">
      <div className="flex h-11 items-center gap-2.5 border-b border-white/[0.07] px-4">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
          {title}
        </h3>
        {accessory}
      </div>
      {children}
    </section>
  );
}
