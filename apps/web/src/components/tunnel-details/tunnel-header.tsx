import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { StopIcon } from "@hugeicons-pro/core-solid-rounded";
import { ConfirmModal } from "../confirm-modal";
import { useAppStore } from "@/lib/store";

interface TunnelHeaderProps {
  tunnel: {
    id: string;
    name?: string | null;
    isOnline: boolean;
    url: string;
  };
  onStop: () => void;
  isStopping: boolean;
}

export function TunnelHeader({
  tunnel,
  onStop,
  isStopping,
}: TunnelHeaderProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { selectedOrganization } = useAppStore();

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tunnel.url);
    setIsCopied(true);

    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setIsCopied(false), 1600);
  };

  return (
    <>
      <header className="flex items-start gap-4 border-b border-white/[0.07] pb-7">
        <Link
          to="/$orgSlug/tunnels"
          params={{ orgSlug: selectedOrganization?.slug || "" }}
          className="mt-0.5 p-1.5 text-zinc-700 transition-colors hover:text-zinc-300"
          aria-label="Back to tunnels"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.7} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
            Tunnel detail
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-white">
              {tunnel.name || tunnel.id}
            </h1>
            <span
              className={`flex items-center gap-1.5 text-[10px] font-medium ${
                tunnel.isOnline ? "text-emerald-500" : "text-red-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  tunnel.isOnline ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              {tunnel.isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-zinc-700">
            <span className="truncate font-mono text-[11px]">{tunnel.url}</span>
            <button
              type="button"
              className={`flex size-7 items-center justify-center rounded-lg transition-colors ${
                isCopied
                  ? "bg-emerald-500/[0.08] text-emerald-400"
                  : "text-zinc-700 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
              onClick={() => void handleCopy()}
              aria-label={isCopied ? "Tunnel URL copied" : "Copy tunnel URL"}
              title={isCopied ? "Copied" : "Copy URL"}
            >
              <HugeiconsIcon
                icon={isCopied ? Tick02Icon : Copy01Icon}
                size={14}
                strokeWidth={1.8}
              />
            </button>
            <a
              href={tunnel.url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300"
              aria-label="Open tunnel"
            >
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={12}
                strokeWidth={1.7}
              />
            </a>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isStopping || !tunnel.isOnline}
          className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-red-500/20 px-3 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/[0.07] disabled:opacity-35"
        >
          <HugeiconsIcon icon={StopIcon} size={14} />
          {isStopping ? "Stopping" : "Stop"}
        </button>
      </header>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={onStop}
        title="Stop Tunnel"
        message="Are you sure you want to stop this tunnel?"
        isDestructive
        confirmText="Stop"
      />
    </>
  );
}
