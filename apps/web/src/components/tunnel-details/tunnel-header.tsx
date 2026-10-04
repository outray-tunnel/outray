import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import ArrowUpRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowUpRight01Icon";
import StopIcon from "@hugeicons-pro/core-solid-rounded/StopIcon";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/arc/dialog/dialog";
import { useAppStore } from "@/lib/store";
import "../outray-arc-theme.css";

type HeaderFeedback = { kind: "success" | "error"; message: string };

interface TunnelHeaderProps {
  tunnel: {
    id: string;
    name?: string | null;
    isOnline: boolean;
    url: string;
    protocol?: string | null;
  };
  onStop: () => Promise<void>;
  isStopping: boolean;
}

export function TunnelHeader({
  tunnel,
  onStop,
  isStopping,
}: TunnelHeaderProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<HeaderFeedback | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const stopInFlight = useRef(false);
  const stopTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const feedbackResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { selectedOrganization } = useAppStore();
  const canOpenInBrowser =
    tunnel.protocol !== "tcp" && tunnel.protocol !== "udp";
  const protocolLabel = (tunnel.protocol || "http").toUpperCase();
  const stopPending = isConfirming || isStopping;

  useEffect(() => {
    return () => {
      if (feedbackResetTimer.current) clearTimeout(feedbackResetTimer.current);
    };
  }, []);

  const showFeedback = (next: HeaderFeedback) => {
    if (feedbackResetTimer.current) clearTimeout(feedbackResetTimer.current);
    setFeedback(next);
    feedbackResetTimer.current = setTimeout(
      () => {
        setFeedback(null);
      },
      next.kind === "error" ? 4000 : 2200,
    );
  };

  const handleOpen = () => {
    try {
      const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(tunnel.url);
      const url = new URL(hasScheme ? tunnel.url : `https://${tunnel.url}`);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
          "This tunnel cannot be opened in a browser. Copy its address instead.",
        );
      }

      // Open a blank tab first so the new page never receives this dashboard as its opener.
      const opened = window.open("about:blank", "_blank");
      if (!opened) {
        throw new Error(
          "Your browser blocked the new tab. Allow pop-ups and try again.",
        );
      }
      try {
        opened.opener = null;
        opened.location.replace(url.href);
      } catch {
        opened.close();
        throw new Error("Could not open the tunnel. Copy its address instead.");
      }
      showFeedback({ kind: "success", message: "Opened in a new tab." });
    } catch (reason) {
      showFeedback({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "Could not open the tunnel.",
      });
    }
  };

  const handleStop = async () => {
    if (stopInFlight.current || isStopping) return;
    stopInFlight.current = true;
    setIsConfirming(true);
    setStopError(null);
    try {
      await onStop();
      setIsConfirmOpen(false);
      showFeedback({ kind: "success", message: "Stop request sent." });
    } catch (reason) {
      setStopError(
        reason instanceof Error ? reason.message : "Could not stop this tunnel. Try again.",
      );
    } finally {
      stopInFlight.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open={isConfirmOpen}
      onOpenChange={(open) => {
        if (stopInFlight.current || isStopping) return;
        setStopError(null);
        setIsConfirmOpen(open);
      }}
    >
      <header className="outray-arc min-w-0">
        <Link
          to="/$orgSlug/tunnels"
          params={{ orgSlug: selectedOrganization?.slug || "" }}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-[11px] text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.7} />
          All tunnels
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="min-w-0 truncate text-[20px] font-normal tracking-[-0.025em] text-zinc-50"
            >
              {tunnel.name || tunnel.id}
            </h1>
            <span
              className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium ${
                tunnel.isOnline
                  ? "bg-emerald-400/[0.08] text-emerald-300"
                  : "bg-rose-400/[0.08] text-rose-300"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  tunnel.isOnline ? "bg-emerald-400" : "bg-rose-400"
                }`}
                aria-hidden="true"
              />
              {tunnel.isOnline ? "Online" : "Offline"}
            </span>
          </div>

          <DialogTrigger asChild>
            <Button
              ref={stopTriggerRef}
              type="button"
              variant="danger"
              size="md"
              disabled={stopPending || !tunnel.isOnline}
              className="outray-arc-stock-buttons shrink-0"
            >
              <HugeiconsIcon icon={StopIcon} size={12} />
              Stop tunnel
            </Button>
          </DialogTrigger>
        </div>

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="shrink-0 font-medium uppercase tracking-[0.1em] text-zinc-500">
            {protocolLabel}
          </span>
          <span className="text-zinc-700" aria-hidden="true">
            /
          </span>
          <span
            className="min-w-0 max-w-full truncate font-mono text-zinc-400"
            title={tunnel.url}
          >
            {tunnel.url}
          </span>
          <CopyButton
            value={tunnel.url}
            label="Copy tunnel URL"
            iconOnly
            variant="plain"
            onCopied={() => setFeedback(null)}
            onCopyError={() =>
              showFeedback({
                kind: "error",
                message: "Could not copy the URL. Select it and copy manually.",
              })
            }
          />
          {canOpenInBrowser && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpen}
              aria-label="Open tunnel in a new tab"
            >
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={12}
                strokeWidth={1.7}
              />
              Open
            </Button>
          )}
          <span
            className={`font-medium ${
              feedback?.kind === "error" ? "text-rose-400" : "text-emerald-400"
            }`}
            role={feedback?.kind === "error" ? "alert" : "status"}
            aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {feedback?.message || ""}
          </span>
        </div>
      </header>

      <DialogContent
        className="outray-arc outray-arc-stop-dialog"
        title="Stop tunnel"
        description="Active connections will close and this address will go offline. You can reconnect using the CLI."
        aria-busy={stopPending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (stopTriggerRef.current && !stopTriggerRef.current.disabled) {
            stopTriggerRef.current.focus();
          } else {
            titleRef.current?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (stopPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (stopPending) event.preventDefault();
        }}
      >
        {stopError && (
          <p role="alert" className="mb-4 text-[13px] text-rose-300">
            {stopError}
          </p>
        )}
        <div className="outray-arc-stock-buttons flex justify-end gap-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            size="md"
            disabled={stopPending}
            onClick={() => setIsConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="md"
            loading={stopPending}
            onClick={() => void handleStop()}
          >
            <HugeiconsIcon icon={StopIcon} size={12} />
            Stop tunnel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
