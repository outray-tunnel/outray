import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import CommandLineIcon from "@hugeicons-pro/core-stroke-rounded/CommandLineIcon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import ArrowDown01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowDown01Icon";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
] as const;

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
          leftIcon={
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              size={14}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          }
          className={`shrink-0 ${copied ? "text-emerald-400" : ""}`}
        >
          {copied ? "Copied" : "Copy"}
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
  const reducedMotion = useReducedMotion();

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
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AnimatePresence initial={false}>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[4px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                portInput.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                triggerRef.current?.focus();
              }}
            >
              <motion.div
                style={{ translate: "-50% -50%" }}
                className="fixed left-1/2 top-1/2 z-[51] flex max-h-[calc(100dvh-2rem)] w-[min(600px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-white/[0.12] bg-[#111112] shadow-[0_28px_90px_rgba(0,0,0,0.7)] outline-none"
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 8, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 4, scale: 0.98 }
                }
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", visualDuration: 0.4, bounce: 0 }
                }
              >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 pb-5 pt-6 sm:px-6">
                  <div className="min-w-0">
                    <Dialog.Title className="text-[20px] font-normal tracking-[-0.03em] text-zinc-100">
                      New tunnel
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-[13px] leading-5 text-zinc-400">
                      Configure your local service, then run the command in your terminal.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Close new tunnel dialog"
                      className="-mr-1 h-8 w-8 shrink-0 !px-0"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        size={16}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                    </Button>
                  </Dialog.Close>
                </header>

                <div className="min-h-0 overflow-y-auto px-5 sm:px-6">
                  <section className="py-5 sm:py-6" aria-label="Configure tunnel command">
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
                          aria-describedby={portError || portMissing ? "new-tunnel-port-error" : undefined}
                          className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
                        />
                      </div>
                      {(portError || portMissing) && (
                        <p id="new-tunnel-port-error" className={`mt-1.5 text-[12px] ${portError ? "text-rose-300" : "text-zinc-400"}`}>
                          {portError ? "Use a port from 1 to 65535." : "Enter the port your app listens on."}
                        </p>
                      )}
                    </div>

                    <div className="mt-5">
                      <span className="mb-2 block text-[13px] font-medium text-zinc-200">
                        Public address
                      </span>
                      <SegmentedControl
                        label="Public address type"
                        options={addressOptions}
                        value={addressMode}
                        fullWidth
                        onValueChange={(value) => {
                          setAddressMode(value);
                          setCopiedCommand(null);
                          setCopyError(null);
                        }}
                        className="[&_button]:h-9 [&_button]:px-1.5 [&_button]:text-[11px] sm:[&_button]:px-3 sm:[&_button]:text-[12px]"
                      />
                      {addressMode === "random" && (
                        <p className="mt-2 text-[12px] text-zinc-400">
                          OutRay assigns an address when your tunnel connects.
                        </p>
                      )}
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {addressMode !== "random" && (
                        <motion.div
                          key={addressMode}
                          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                          transition={{ duration: reducedMotion ? 0 : 0.16 }}
                          className="mt-4"
                        >
                          <label
                            htmlFor="new-tunnel-address"
                            className="mb-2 block text-[12px] font-medium text-zinc-400"
                          >
                            {addressMode === "subdomain" ? "Subdomain" : "Custom domain"}
                          </label>
                          <div className="flex h-11 items-center overflow-hidden rounded-lg border border-white/[0.12] bg-[#0a0a0b] focus-within:border-white/[0.35] focus-within:ring-1 focus-within:ring-white/[0.12]">
                            <input
                              id="new-tunnel-address"
                              type="text"
                              autoComplete="off"
                              spellCheck={false}
                              value={address}
                              onChange={(event) => {
                                if (addressMode === "subdomain") {
                                  setSubdomain(event.target.value);
                                } else {
                                  setDomain(event.target.value);
                                }
                                setCopiedCommand(null);
                                setCopyError(null);
                              }}
                              placeholder={addressMode === "subdomain" ? "my-app" : "app.example.com"}
                              aria-invalid={!!addressError}
                              aria-describedby={addressError || addressMissing ? "new-tunnel-address-error" : undefined}
                              className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500"
                            />
                            {addressMode === "subdomain" && (
                              <span className="shrink-0 pr-3.5 font-mono text-[12px] text-zinc-400">
                                .outray.app
                              </span>
                            )}
                          </div>
                          {addressError || addressMissing ? (
                            <p id="new-tunnel-address-error" className={`mt-1.5 text-[12px] ${addressError ? "text-rose-300" : "text-zinc-400"}`}>
                              {addressError
                                ? `Enter a valid ${addressMode === "subdomain" ? "subdomain" : "domain"}.`
                                : `Enter a ${addressMode === "subdomain" ? "subdomain" : "domain"} to generate the command.`}
                            </p>
                          ) : (
                            <p className="mt-1.5 text-[12px] text-zinc-400">
                              {addressMode === "domain"
                                ? "The domain must already be configured in this workspace."
                                : "Choose a name for your OutRay address."}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="mt-6 rounded-xl border border-white/[0.11] bg-[#09090a] p-3.5 sm:p-4">
                      <div className="mb-3 flex items-center gap-2 text-[12px] font-medium text-zinc-300">
                        <HugeiconsIcon icon={CommandLineIcon} size={15} strokeWidth={1.8} aria-hidden="true" />
                        Run in your terminal
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <code
                          aria-label="Tunnel start command"
                          className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap py-1 font-mono text-[12px] text-zinc-100"
                        >
                          {command ?? "Complete the fields above to see your command"}
                        </code>
                        <Button
                          type="button"
                          variant="primary"
                          shape="pill"
                          size="lg"
                          disabled={!command}
                          onClick={() => {
                            if (command) void copyToClipboard(command, "start");
                          }}
                          leftIcon={
                            <HugeiconsIcon
                              icon={copiedCommand === "start" ? Tick02Icon : Copy01Icon}
                              size={15}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          }
                          className="shrink-0"
                        >
                          {copiedCommand === "start" ? "Copied" : "Copy command"}
                        </Button>
                      </div>
                      <p className="mt-3 text-[12px] leading-5 text-zinc-500">
                        Your tunnel will appear here as soon as the CLI connects.
                      </p>
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
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
