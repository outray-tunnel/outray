import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import ArrowUpRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowUpRight01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import StopIcon from "@hugeicons-pro/core-solid-rounded/StopIcon";
import { ConfirmModal } from "../confirm-modal";
import { useAppStore } from "@/lib/store";

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
  const [isCopied, setIsCopied] = useState(false);
  const [feedback, setFeedback] = useState<HeaderFeedback | null>(null);
  const feedbackResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { selectedOrganization } = useAppStore();
  const canOpenInBrowser =
    tunnel.protocol !== "tcp" && tunnel.protocol !== "udp";
  const protocolLabel = (tunnel.protocol || "http").toUpperCase();

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
        setIsCopied(false);
      },
      next.kind === "error" ? 4000 : 2200,
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tunnel.url);
      setIsCopied(true);
      showFeedback({ kind: "success", message: "Tunnel URL copied." });
    } catch {
      setIsCopied(false);
      showFeedback({
        kind: "error",
        message: "Could not copy the URL. Select it and copy manually.",
      });
    }
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
    await onStop();
    showFeedback({ kind: "success", message: "Stop request sent." });
  };

  return (
    <>
      <header className="min-w-0">
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
            <h1 className="min-w-0 truncate text-[20px] font-normal tracking-[-0.025em] text-zinc-50">
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

          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            disabled={isStopping || !tunnel.isOnline}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/[0.10] px-2.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-rose-400/25 hover:bg-rose-400/[0.05] hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:opacity-35 motion-reduce:transition-none"
          >
            <HugeiconsIcon icon={StopIcon} size={12} />
            {isStopping ? "Stopping" : "Stop tunnel"}
          </button>
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
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1 rounded px-1.5 font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${
              isCopied
                ? "text-emerald-300"
                : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
            }`}
            onClick={() => void handleCopy()}
            aria-label="Copy tunnel URL"
          >
            <HugeiconsIcon
              icon={isCopied ? Tick02Icon : Copy01Icon}
              size={13}
              strokeWidth={1.8}
            />
            {isCopied ? "Copied" : "Copy"}
          </button>
          {canOpenInBrowser && (
            <button
              type="button"
              onClick={handleOpen}
              className="inline-flex h-7 items-center gap-1 rounded px-1.5 font-medium text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
              aria-label="Open tunnel in a new tab"
            >
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={12}
                strokeWidth={1.7}
              />
              Open
            </button>
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

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleStop}
        title="Stop Tunnel"
        message="Are you sure you want to stop this tunnel?"
        isDestructive
        confirmText="Stop"
      />
    </>
  );
}
