import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Info, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/arc/button/button";
import { appClient } from "@/lib/app-client";
import type { TunnelEvent } from "./types";

interface FullCaptureDisabledContentProps {
  request: TunnelEvent;
  orgSlug: string;
}

export function FullCaptureDisabledContent({
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
      void queryClient.invalidateQueries({
        queryKey: ["org-settings", orgSlug],
      });
      toast.success("Full request capture enabled");
      setShowConfirmation(false);
    },
  });

  function changeOpen(open: boolean) {
    if (enableFullCaptureMutation.isPending) return;
    if (open) enableFullCaptureMutation.reset();
    setShowConfirmation(open);
  }

  return (
    <Dialog.Root open={showConfirmation} onOpenChange={changeOpen}>
      <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-4">
        <Database
          size={17}
          className="mt-0.5 shrink-0 text-zinc-400"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-zinc-200">
            Full capture is off
          </h3>
          <p className="mt-1.5 text-[12px] leading-5 text-zinc-400">
            This request has metadata only. Enable full capture to inspect
            headers and bodies, and replay future requests.
          </p>
          <Dialog.Trigger asChild>
            <Button variant="secondary" size="sm" className="mt-3">
              Enable full capture
            </Button>
          </Dialog.Trigger>
        </div>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[71] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#171718] p-5 text-[13px] text-zinc-200 shadow-2xl focus:outline-none"
          onEscapeKeyDown={(event) => {
            if (enableFullCaptureMutation.isPending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (enableFullCaptureMutation.isPending) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (enableFullCaptureMutation.isPending) event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-[16px] font-medium">
              Enable full capture?
            </Dialog.Title>
            <Dialog.Close
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 motion-reduce:transition-none"
              disabled={enableFullCaptureMutation.isPending}
              aria-label="Close capture confirmation"
            >
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 text-[13px] leading-5 text-zinc-400">
            Store request and response headers and bodies for future traffic in
            this workspace. Past requests cannot be captured retroactively.
          </Dialog.Description>
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[12px] leading-5 text-amber-200">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            Payloads may contain sensitive data. Enable capture only when your
            traffic-handling policy allows it.
          </p>
          {enableFullCaptureMutation.error && (
            <p
              role="alert"
              className="mt-4 text-[12px] leading-5 text-rose-300"
            >
              Could not enable full capture. Please try again.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button
                variant="secondary"
                size="sm"
                disabled={enableFullCaptureMutation.isPending}
              >
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              size="sm"
              loading={enableFullCaptureMutation.isPending}
              onClick={() => enableFullCaptureMutation.mutate()}
            >
              {enableFullCaptureMutation.isPending
                ? "Enabling capture…"
                : "Enable full capture"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
