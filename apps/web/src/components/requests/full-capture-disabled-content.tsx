import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DatabaseIcon,
  InformationCircleIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import { appClient } from "@/lib/app-client";
import type { TunnelEvent } from "./types";
import { getHttpMethodColor } from "./utils";
import { formatBytes } from "./utils";

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
              className="fixed inset-0 z-[100] flex h-screen w-screen items-center justify-center bg-black/70 p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#080808] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
              >
                <div className="border-b border-white/[0.07] px-5 py-5">
                  <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-700">
                    Request settings
                  </p>
                  <h3 className="mt-3 text-lg font-semibold tracking-[-0.025em] text-white">
                    Enable full capture?
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-600">
                    Store complete headers and body content for detailed
                    inspection and request replay.
                  </p>
                </div>
                <div className="px-5 py-5">
                  <div className="flex items-start gap-2.5 border-l border-amber-400/35 py-0.5 pl-3 text-[10px] leading-4 text-amber-200/60">
                    <HugeiconsIcon
                      icon={InformationCircleIcon}
                      size={13}
                      strokeWidth={1.7}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    Request and response bodies may contain sensitive data.
                    Enable this only when your traffic-handling policy permits
                    storage.
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setShowConfirmation(false)}
                    className="h-8 rounded-md px-3 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => enableFullCaptureMutation.mutate()}
                    disabled={enableFullCaptureMutation.isPending}
                    className="h-8 rounded-md bg-white px-3 text-[10px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {enableFullCaptureMutation.isPending
                      ? "Enabling…"
                      : "Enable full capture"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <div className="rounded-xl border border-white/[0.07] px-4 py-5">
        <div className="flex items-start gap-3">
          <HugeiconsIcon
            icon={DatabaseIcon}
            size={16}
            strokeWidth={1.7}
            className="mt-0.5 shrink-0 text-zinc-600"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-300">
              Full capture is disabled
            </p>
            <p className="mt-1.5 text-[10px] leading-4 text-zinc-600">
              Only basic request metadata is available. Enable full capture to
              inspect headers, body, and replay requests.
            </p>
            <button
              type="button"
              onClick={() => setShowConfirmation(true)}
              className="mt-4 h-8 rounded-md bg-white px-3 text-[10px] font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              Enable full capture
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-white/[0.07]">
        <div className="flex h-11 items-center border-b border-white/[0.07] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            General
          </span>
        </div>
        <div className="divide-y divide-white/[0.055]">
          <MetadataRow
            label="URL"
            value={`https://${request.host}${request.path}`}
          />
          <MetadataRow
            label="Method"
            value={request.method}
            valueClassName={getHttpMethodColor(request.method)}
          />
          <MetadataRow label="Status" value={String(request.status_code)} />
          <MetadataRow label="Client IP" value={request.client_ip} />
          <MetadataRow
            label="Duration"
            value={`${request.request_duration_ms}ms`}
          />
          <MetadataRow
            label="Size"
            value={formatBytes(request.bytes_in + request.bytes_out)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.07] opacity-45">
        <div className="flex h-11 items-center border-b border-white/[0.07] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            Headers
          </span>
        </div>
        <div className="space-y-3.5 px-4 py-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-6">
              <div className="h-2.5 w-20 bg-white/[0.06]" />
              <div className="h-2.5 flex-1 bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.07] opacity-45">
        <div className="flex h-11 items-center border-b border-white/[0.07] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            Body
          </span>
        </div>
        <div className="space-y-3 px-4 py-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-2.5 bg-white/[0.07]"
              style={{ width: `${80 - i * 15}%` }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  valueClassName = "text-zinc-400",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-5 px-4 py-3">
      <span className="font-mono text-[10px] text-zinc-700">{label}</span>
      <span
        className={`break-all text-right font-mono text-[10px] leading-4 ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}
