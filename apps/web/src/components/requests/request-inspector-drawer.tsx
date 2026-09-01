import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import ReplayIcon from "@hugeicons-pro/core-stroke-rounded/ReplayIcon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import type { TunnelEvent, InspectorTab } from "./types";
import { generateCurl, getHttpMethodColor } from "./utils";
import { RequestTabContent } from "./request-tab-content";
import { ResponseTabContent } from "./response-tab-content";
import { FullCaptureDisabledContent } from "./full-capture-disabled-content";
import { useRequestCapture } from "./use-request-capture";
import { ReplayModal } from "./replay-modal";

function SkeletonLoader() {
  return (
    <div className="space-y-7 animate-pulse">
      {[3, 6, 4].map((rowCount, sectionIndex) => (
        <section
          key={rowCount}
          className="rounded-xl border border-white/[0.07]"
        >
          <div className="flex h-11 items-center border-b border-white/[0.07] px-4">
            <div
              className="h-2.5 bg-white/[0.06]"
              style={{ width: sectionIndex === 0 ? 56 : 48 }}
            />
          </div>
          <div className="space-y-3.5 px-4 py-4">
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-6">
                <div className="h-2.5 w-20 shrink-0 bg-white/[0.04]" />
                <div
                  className="h-2.5 bg-white/[0.055]"
                  style={{
                    width: `${46 + ((rowIndex + sectionIndex) % 3) * 14}%`,
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RequestInspectorDrawerProps {
  request: TunnelEvent | null;
  onClose: () => void;
  fullCaptureEnabled: boolean;
  orgSlug: string;
}

export function RequestInspectorDrawer({
  request,
  onClose,
  fullCaptureEnabled,
  orgSlug,
}: RequestInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("request");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showReplayModal, setShowReplayModal] = useState(false);

  const { capture, loading, error } = useRequestCapture(orgSlug, request);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!request) return null;

  // Extract query params from path
  const getQueryParams = (path: string) => {
    if (!path.includes("?")) return {};
    const searchParams = new URLSearchParams(path.split("?")[1]);
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  };

  // Create request details from real data or fallback to basic info
  const requestDetails = capture
    ? {
        headers: capture.request.headers,
        queryParams: getQueryParams(request.path),
        body: capture.request.body,
      }
    : {
        headers: {
          Host: request.host,
          "User-Agent": request.user_agent,
          "X-Forwarded-For": request.client_ip,
        },
        queryParams: getQueryParams(request.path),
        body: null,
      };

  const responseDetails = capture
    ? {
        headers: capture.response.headers,
        body: capture.response.body,
      }
    : null;

  const tabs = [
    { id: "request" as InspectorTab, label: "Request" },
    { id: "response" as InspectorTab, label: "Response" },
  ];

  return (
    <AnimatePresence>
      {request && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/65"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-white/[0.08] bg-[#080808] shadow-[-24px_0_80px_rgba(0,0,0,0.45)]"
          >
            <header className="shrink-0 border-b border-white/[0.07] px-5 py-5 sm:px-6">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-700">
                    Request inspector
                  </p>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        request.status_code >= 500
                          ? "text-red-400"
                          : request.status_code >= 400
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {request.status_code}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-medium ${getHttpMethodColor(request.method)}`}
                    >
                      {request.method}
                    </span>
                    <span
                      className="truncate font-mono text-[11px] text-zinc-600"
                      title={request.path}
                    >
                      {request.path}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
                  aria-label="Close request inspector"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </header>

            {fullCaptureEnabled && (
              <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] px-5 sm:px-6">
                {loading ? (
                  <>
                    <div className="h-8 w-28 animate-pulse rounded-md bg-white/[0.05]" />
                    <div className="h-8 w-28 animate-pulse rounded-md bg-white/[0.04]" />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowReplayModal(true)}
                      disabled={!capture}
                      className="flex h-8 items-center gap-2 rounded-md bg-white px-3 text-[10px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <HugeiconsIcon
                        icon={ReplayIcon}
                        size={13}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      Replay request
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(generateCurl(request), "curl")
                      }
                      className="flex h-8 items-center gap-2 rounded-md border border-white/[0.09] px-3 text-[10px] font-medium text-zinc-500 transition-colors hover:border-white/[0.16] hover:bg-white/[0.03] hover:text-zinc-300"
                    >
                      <HugeiconsIcon
                        icon={copiedField === "curl" ? Tick02Icon : Copy01Icon}
                        size={13}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {copiedField === "curl" ? "Copied" : "Copy as cURL"}
                    </button>
                  </>
                )}
              </div>
            )}

            {fullCaptureEnabled && (
              <nav className="flex h-11 shrink-0 items-end gap-6 border-b border-white/[0.07] px-5 sm:px-6">
                {loading ? (
                  <>
                    <div className="mb-4 h-2 w-14 animate-pulse bg-white/[0.05]" />
                    <div className="mb-4 h-2 w-16 animate-pulse bg-white/[0.04]" />
                  </>
                ) : (
                  tabs.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`h-11 border-b text-[10px] font-medium transition-colors ${
                        activeTab === id
                          ? "border-white text-zinc-200"
                          : "border-transparent text-zinc-700 hover:text-zinc-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))
                )}
              </nav>
            )}

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
              {!fullCaptureEnabled ? (
                <FullCaptureDisabledContent
                  request={request}
                  orgSlug={orgSlug}
                />
              ) : loading ? (
                <SkeletonLoader />
              ) : error ? (
                <div>
                  <div className="border-l border-amber-400/35 py-0.5 pl-3">
                    <p className="text-xs text-amber-300/75">{error}</p>
                    <p className="mt-1 text-[10px] text-zinc-700">
                      Showing basic request information instead.
                    </p>
                  </div>
                  <div className="mt-6">
                    <RequestTabContent
                      request={request}
                      details={requestDetails}
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />
                  </div>
                </div>
              ) : capture ? (
                <>
                  {activeTab === "request" && (
                    <RequestTabContent
                      request={request}
                      details={requestDetails}
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />
                  )}
                  {activeTab === "response" && responseDetails && (
                    <ResponseTabContent
                      details={responseDetails}
                      copiedField={copiedField}
                      onCopy={copyToClipboard}
                    />
                  )}
                </>
              ) : (
                <div className="border-l border-white/[0.12] py-0.5 pl-3">
                  <p className="text-xs text-zinc-400">
                    No detailed request data available.
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-zinc-700">
                    This request may have occurred before full capture was
                    enabled.
                  </p>
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-white/[0.07] px-5 py-4 sm:px-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-zinc-800">
                    Tunnel ID
                  </span>
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">
                    {request.tunnel_id}
                  </p>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-zinc-800">
                    Timestamp
                  </span>
                  <p className="mt-1 text-[10px] tabular-nums text-zinc-600">
                    {new Date(request.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </footer>
          </motion.div>

          {/* Replay Modal */}
          {capture && (
            <ReplayModal
              isOpen={showReplayModal}
              onClose={() => setShowReplayModal(false)}
              request={request}
              capture={capture}
              orgSlug={orgSlug}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
