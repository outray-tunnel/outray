import { useEffect, useRef, useState, type RefObject } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import CommandLineIcon from "@hugeicons-pro/core-stroke-rounded/CommandLineIcon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import ArrowDown01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowDown01Icon";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import "./outray-arc-theme.css";
import {
  buildNewTunnelCommand,
  isValidLocalPort,
  isValidTunnelAddress,
  type TunnelAddressMode,
} from "./new-tunnel-commands";

const addressOptions = [
  { value: "random", label: "Automatic" },
  { value: "subdomain", label: "Subdomain" },
  { value: "domain", label: "Custom domain" },
];

function SetupCommand({
  title,
  description,
  command,
  copied,
  copyError,
  onCopy,
}: {
  title: string;
  description: string;
  command: string;
  copied: boolean;
  copyError?: string;
  onCopy: () => void;
}) {
  return (
    <li className="py-3.5 first:pt-2 last:pb-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-zinc-200">{title}</p>
        <p className="text-[11px] text-zinc-500">{description}</p>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/25 py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-zinc-300">
          {command}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCopy}
          aria-label={
            copied
              ? `${title} command copied`
              : `Copy ${title.toLowerCase()} command`
          }
          className={`shrink-0 ${copied ? "text-emerald-400" : ""}`}
        >
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            size={14}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          Copy
        </Button>
      </div>
      {copyError && <p role="alert" className="mt-2 text-[12px] text-rose-300">{copyError}</p>}
    </li>
  );
}

export function NewTunnelModal({
  isOpen,
  onClose,
  orgSlug,
  triggerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [port, setPort] = useState("8000");
  const [addressMode, setAddressMode] = useState<TunnelAddressMode>("random");
  const [subdomain, setSubdomain] = useState("");
  const [domain, setDomain] = useState("");
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<{ id: string; message: string } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portInput = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const address = addressMode === "subdomain" ? subdomain : domain;
  const command = buildNewTunnelCommand({
    orgSlug,
    port,
    addressMode,
    address,
  });
  const portMissing = port.length === 0;
  const portError = !portMissing && !isValidLocalPort(port);
  const addressMissing = addressMode !== "random" && !address.trim();
  const addressError =
    addressMode !== "random" &&
    !addressMissing &&
    !isValidTunnelAddress(addressMode, address);

  async function copyToClipboard(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(null);
      setCopiedCommand(id);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedCommand(null), 2200);
    } catch {
      setCopiedCommand(null);
      setCopyError({ id, message: "Couldn't copy automatically. Select the command and copy it manually." });
    }
  }

  function handleClose() {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopiedCommand(null);
    setCopyError(null);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        title="New tunnel"
        description="Configure your local service, then run the command in your terminal."
        className="outray-arc outray-arc-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          portInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <div className="min-w-0">
                  <section className="pb-5" aria-label="Configure tunnel command">
                    <div>
                      <label
                        htmlFor="new-tunnel-local-port"
                        className="mb-2 block text-[13px] font-medium text-zinc-200"
                      >
                        Local service port
                      </label>
                      <div className="flex h-11 items-center overflow-hidden rounded-lg border border-white/[0.12] bg-[#0a0a0b] transition-colors focus-within:border-white/[0.35] focus-within:ring-1 focus-within:ring-white/[0.12]">
                        <span aria-hidden="true" className="shrink-0 border-r border-white/[0.08] px-3.5 font-mono text-[13px] text-zinc-500">
                          localhost:
                        </span>
                        <input
                          ref={portInput}
                          id="new-tunnel-local-port"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={port}
                          onChange={(event) => {
                            setPort(event.target.value.slice(0, 5));
                            setCopiedCommand(null);
                            setCopyError(null);
                          }}
                          aria-invalid={!!portError}
                          aria-describedby="new-tunnel-port-hint"
                          className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
                        />
                      </div>
                      <p id="new-tunnel-port-hint" className={`mt-1.5 min-h-5 text-[12px] ${portError ? "text-rose-300" : "text-zinc-400"}`}>
                        {portError
                          ? "Use a port from 1 to 65535."
                          : portMissing
                            ? "Enter the port your app listens on."
                            : "The port your app listens on, such as 3000."}
                      </p>
                    </div>

                    <div className="mt-5">
                      <span className="mb-2 block text-[13px] font-medium text-zinc-200">
                        Public address
                      </span>
                      <SegmentedControl
                        label="Public address type"
                        options={addressOptions}
                        value={addressMode}
                        onValueChange={(value) => {
                          if (value !== "random" && value !== "subdomain" && value !== "domain") return;
                          setAddressMode(value);
                          setCopiedCommand(null);
                          setCopyError(null);
                        }}
                        className="w-full"
                      />
                    </div>

                    <div className="mt-4 min-h-[118px]">
                      <label
                        htmlFor="new-tunnel-address"
                        className="mb-2 block text-[12px] font-medium text-zinc-400"
                      >
                        {addressMode === "random"
                          ? "Address"
                          : addressMode === "subdomain"
                            ? "Subdomain"
                            : "Custom domain"}
                      </label>
                      <div className="flex h-11 items-center overflow-hidden rounded-lg border border-white/[0.12] bg-[#0a0a0b] focus-within:border-white/[0.35] focus-within:ring-1 focus-within:ring-white/[0.12]">
                        <input
                          id="new-tunnel-address"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          disabled={addressMode === "random"}
                          value={addressMode === "random" ? "Assigned when connected" : address}
                          onChange={(event) => {
                            if (addressMode === "subdomain") {
                              setSubdomain(event.target.value);
                            } else if (addressMode === "domain") {
                              setDomain(event.target.value);
                            }
                            setCopiedCommand(null);
                            setCopyError(null);
                          }}
                          placeholder={addressMode === "subdomain" ? "my-app" : "app.example.com"}
                          aria-invalid={!!addressError}
                          aria-describedby="new-tunnel-address-hint"
                          className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500 disabled:text-zinc-500"
                        />
                        {addressMode === "subdomain" && (
                          <span className="shrink-0 pr-3.5 font-mono text-[12px] text-zinc-400">
                            .outray.app
                          </span>
                        )}
                      </div>
                      <p
                        id="new-tunnel-address-hint"
                        className={`mt-1.5 min-h-9 text-[12px] ${addressError ? "text-rose-300" : "text-zinc-400"}`}
                      >
                        {addressError
                          ? `Enter a valid ${addressMode === "subdomain" ? "subdomain" : "domain"}.`
                          : addressMissing
                            ? `Enter a ${addressMode === "subdomain" ? "subdomain" : "domain"} to generate the command.`
                            : addressMode === "random"
                              ? "OutRay assigns a URL when your tunnel connects."
                              : addressMode === "domain"
                                ? "Set up this domain in your workspace first."
                                : "Choose a name for your OutRay address."}
                      </p>
                    </div>

                    <div className="mt-6 rounded-xl border border-white/[0.11] bg-[#09090a] p-3.5 sm:p-4">
                      <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-zinc-300">
                        <HugeiconsIcon icon={CommandLineIcon} size={15} strokeWidth={1.8} aria-hidden="true" />
                        Run in your terminal
                      </div>
                      <div className="rounded-lg border border-white/[0.08] bg-black/30 px-3.5 py-3">
                        <code
                          aria-label="Tunnel start command"
                          className="block whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-zinc-100 select-text"
                        >
                          {command ?? "Complete the fields above to see your command"}
                        </code>
                      </div>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[12px] leading-5 text-zinc-500">
                          Your tunnel will appear here as soon as the CLI connects.
                        </p>
                        <Button
                          type="button"
                          variant="primary"
                          size="md"
                          disabled={!command}
                          onClick={() => {
                            if (command) void copyToClipboard(command, "start");
                          }}
                          aria-label={copiedCommand === "start" ? "Tunnel command copied" : "Copy tunnel command"}
                          className="shrink-0 self-start sm:self-auto"
                        >
                          <HugeiconsIcon
                            icon={copiedCommand === "start" ? Tick02Icon : Copy01Icon}
                            size={15}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                          Copy command
                        </Button>
                      </div>
                      {copyError?.id === "start" && (
                        <p role="alert" className="mt-2 text-[12px] text-rose-300">
                          {copyError.message}
                        </p>
                      )}
                    </div>
                  </section>

                  <details className="group border-t border-white/[0.07] pb-3 pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 text-[13px] text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2.5">
                        <HugeiconsIcon icon={CommandLineIcon} size={16} strokeWidth={1.8} aria-hidden="true" />
                        First time using the CLI?
                      </span>
                      <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                    </summary>
                    <ol className="divide-y divide-white/[0.07]">
                      <SetupCommand
                        title="Install the CLI"
                        description="Once per machine"
                        command="npm install -g outray"
                        copied={copiedCommand === "install"}
                        copyError={copyError?.id === "install" ? copyError.message : undefined}
                        onCopy={() => void copyToClipboard("npm install -g outray", "install")}
                      />
                      <SetupCommand
                        title="Sign in"
                        description="Connect your account"
                        command="outray login"
                        copied={copiedCommand === "login"}
                        copyError={copyError?.id === "login" ? copyError.message : undefined}
                        onCopy={() => void copyToClipboard("outray login", "login")}
                      />
                    </ol>
                  </details>
                  <p role="status" className="sr-only">
                    {copiedCommand === "install"
                      ? "Install command copied."
                      : copiedCommand === "login"
                        ? "Sign-in command copied."
                        : copiedCommand === "start"
                          ? "Tunnel command copied."
                          : ""}
                  </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
