import { useState } from "react";
import { X, Copy, Play, ArrowDownToLine, ArrowUpFromLine, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { TunnelEvent, InspectorTab } from "./types";
import { generateCurl } from "./utils";
import { RequestTabContent } from "./request-tab-content";
import { ResponseTabContent } from "./response-tab-content";
import { FullCaptureDisabledContent } from "./full-capture-disabled-content";
import { useRequestCapture } from "./use-request-capture";
import { ReplayModal } from "./replay-modal";
import { Button, IconButton } from "@/components/ui";

function SkeletonLoader() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* General Info Skeleton */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <div className="h-4 w-16 bg-white/10 rounded" />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between">
            <div className="h-3 w-12 bg-white/10 rounded" />
            <div className="h-3 w-48 bg-white/10 rounded" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 w-16 bg-white/10 rounded" />
            <div className="h-3 w-12 bg-white/10 rounded" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-3 w-24 bg-white/10 rounded" />
          </div>
        </div>
      </div>

      {/* Headers Skeleton */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="h-4 w-16 bg-white/10 rounded" />
          <div className="h-6 w-6 bg-white/10 rounded" />
        </div>
        <div className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-3 w-24 bg-white/10 rounded" />
              <div className="h-3 flex-1 bg-white/10 rounded" style={{ maxWidth: `${60 + Math.random() * 40}%` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Body Skeleton */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="h-4 w-12 bg-white/10 rounded" />
          <div className="h-6 w-6 bg-white/10 rounded" />
        </div>
        <div className="p-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 bg-white/10 rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
          ))}
        </div>
      </div>
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
  const requestDetails = capture ? {
    headers: capture.request.headers,
    queryParams: getQueryParams(request.path),
    body: capture.request.body,
  } : {
    headers: {
      Host: request.host,
      "User-Agent": request.user_agent,
      "X-Forwarded-For": request.client_ip,
    },
    queryParams: getQueryParams(request.path),
    body: null,
  };

  const responseDetails = capture ? {
    headers: capture.response.headers,
    body: capture.response.body,
  } : null;

  const tabs = [
    { id: "request" as InspectorTab, label: "Request", icon: ArrowUpFromLine },
    { id: "response" as InspectorTab, label: "Response", icon: ArrowDownToLine },
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-[#0A0A0A] border-l border-white/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div
                  className={`inline-flex items-center px-2.5 py-1 rounded text-sm font-medium ${
                    request.status_code >= 500
                      ? "bg-red-500/10 text-red-400 border border-red-500/20"
                      : request.status_code >= 400
                        ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                        : "bg-green-500/10 text-green-400 border border-green-500/20"
                  }`}
                >
                  {request.status_code}
                </div>
                <span className="font-mono text-white font-medium">{request.method}</span>
                <span className="text-gray-400 truncate max-w-xs" title={request.path}>
                  {request.path}
                </span>
              </div>
              <IconButton
                onClick={onClose}
                icon={<X size={20} />}
                aria-label="Close"
              />
            </div>

            {/* Actions */}
            {fullCaptureEnabled && (
              <div className="flex items-center gap-2 p-4 border-b border-white/10">
                {loading ? (
                  <>
                    <div className="h-9 w-32 bg-white/5 rounded-xl animate-pulse" />
                    <div className="h-9 w-28 bg-white/5 rounded-xl animate-pulse" />
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => setShowReplayModal(true)}
                      disabled={!capture}
                      variant="accent"
                      leftIcon={<Play size={16} />}
                    >
                      Replay Request
                    </Button>
                    <Button
                      onClick={() => copyToClipboard(generateCurl(request), "curl")}
                      variant="secondary"
                      leftIcon={copiedField === "curl" ? <Check size={16} /> : <Copy size={16} />}
                    >
                      {copiedField === "curl" ? "Copied!" : "Copy as cURL"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Tabs - show skeleton when loading */}
            {fullCaptureEnabled && (
              <div className="flex items-center gap-1 p-4 border-b border-white/10">
                {loading ? (
                  <>
                    <div className="h-9 w-24 bg-white/5 rounded-lg animate-pulse" />
                    <div className="h-9 w-24 bg-white/5 rounded-lg animate-pulse" />
                  </>
                ) : (
                  tabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        activeTab === id
                          ? "bg-white/10 text-white"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!fullCaptureEnabled ? (
                <FullCaptureDisabledContent request={request} orgSlug={orgSlug} />
              ) : loading ? (
                <SkeletonLoader />
              ) : error ? (
                <div className="py-8">
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                    <p className="text-orange-300">{error}</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Showing basic request information instead.
                    </p>
                  </div>
                  <div className="mt-4">
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
                <div className="py-8">
                  <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4">
                    <p className="text-gray-300">No detailed request data available.</p>
                    <p className="text-gray-400 text-sm mt-2">
                      This request may have occurred before full capture was enabled.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer metadata */}
            <div className="p-4 border-t border-white/10 bg-white/2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Tunnel ID</span>
                  <p className="text-gray-300 font-mono text-xs mt-1">{request.tunnel_id}</p>
                </div>
                <div>
                  <span className="text-gray-500">Timestamp</span>
                  <p className="text-gray-300 text-xs mt-1">
                    {new Date(request.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
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
