import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { appClient } from "@/lib/app-client";
import type { TunnelEvent } from "./types";
import { formatBytes } from "./utils";
import { Button } from "@/components/ui";

interface FullCaptureDisabledContentProps {
  request: TunnelEvent;
  orgSlug: string;
}

export function FullCaptureDisabledContent({
  request,
  orgSlug,
}: FullCaptureDisabledContentProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const queryClient = useQueryClient();

  const enableFullCaptureMutation = useMutation({
    mutationFn: async () => {
      const response = await appClient.settings.update(orgSlug, {
        fullCaptureEnabled: true,
      });
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings", orgSlug] });
      toast.success("Full request capture enabled");
      setShowConfirmation(false);
    },
    onError: () => {
      toast.error("Failed to enable full capture");
    },
  });

  return (
    <div className="space-y-6">
      {createPortal(
        <AnimatePresence>
          {showConfirmation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-[#141414] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl"
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  Enable Full Capture?
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  This will capture and store complete request and response data
                  including headers and body content. This allows for detailed
                  request inspection and replay functionality.
                </p>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-6">
                  <p className="text-xs text-amber-300">
                    <strong>Privacy Notice:</strong> Enabling this feature will
                    store request/response bodies which may contain sensitive
                    data. Only enable if you consent to storing this traffic
                    data.
                  </p>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    onClick={() => setShowConfirmation(false)}
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => enableFullCaptureMutation.mutate()}
                    disabled={enableFullCaptureMutation.isPending}
                    isLoading={enableFullCaptureMutation.isPending}
                    variant="accent"
                  >
                    {enableFullCaptureMutation.isPending
                      ? "Enabling..."
                      : "Enable Full Capture"}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <div className="bg-accent/10 border border-accent/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full border border-accent/40 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-accent text-xs">i</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white mb-1">
              Full capture is disabled
            </p>
            <p className="text-sm text-gray-400 mb-3">
              Only basic request metadata is available. Enable full capture to
              inspect headers, body, and replay requests.
            </p>
            <Button
              onClick={() => setShowConfirmation(true)}
              variant="accent"
              size="sm"
            >
              Enable full capture
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">General</span>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">URL</span>
            <span className="text-gray-300 font-mono">
              https://{request.host}
              {request.path}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Method</span>
            <span className="text-gray-300 font-mono">{request.method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className="text-gray-300 font-mono">
              {request.status_code}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Client IP</span>
            <span className="text-gray-300 font-mono">{request.client_ip}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Duration</span>
            <span className="text-gray-300 font-mono">
              {request.request_duration_ms}ms
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Size</span>
            <span className="text-gray-300 font-mono">
              {formatBytes(request.bytes_in + request.bytes_out)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden opacity-50">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">Headers</span>
        </div>
        <div className="p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="h-4 w-24 bg-white/10 rounded" />
              <div className="h-4 flex-1 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden opacity-50">
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-sm font-medium text-white">Body</span>
        </div>
        <div className="p-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-4 bg-white/10 rounded"
              style={{ width: `${80 - i * 15}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
