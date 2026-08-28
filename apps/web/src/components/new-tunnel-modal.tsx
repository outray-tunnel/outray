import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  CommandLineIcon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { Modal } from "@/components/ui";

type Command = {
  id: string;
  title: string;
  command: string;
  description: string;
};

const quickStartCommands: Command[] = [
  {
    id: "install",
    title: "Install the CLI",
    command: "npm install -g outray",
    description: "Install OutRay globally on your machine.",
  },
  {
    id: "login",
    title: "Authenticate",
    command: "outray login",
    description: "Sign in and connect the CLI to your account.",
  },
  {
    id: "start",
    title: "Open the tunnel",
    command: "outray 8000",
    description: "Expose the service running locally on port 8000.",
  },
];

const configurationCommands: Command[] = [
  {
    id: "subdomain",
    title: "Reserved subdomain",
    command: "outray 8000 --subdomain my-app",
    description: "Use a stable address such as my-app.outray.app.",
  },
  {
    id: "domain",
    title: "Custom domain",
    command: "outray 8000 --domain app.example.com",
    description: "Route traffic through a configured custom domain.",
  },
  {
    id: "org",
    title: "Specific organization",
    command: "outray 8000 --org my-team",
    description: "Create the tunnel inside a specific organization.",
  },
];

export function NewTunnelModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"quick-start" | "configuration">(
    "quick-start",
  );

  const copyToClipboard = async (command: string, id: string) => {
    await navigator.clipboard.writeText(command);
    setCopiedCommand(id);
    window.setTimeout(() => setCopiedCommand(null), 2000);
  };

  const commands =
    activeTab === "quick-start" ? quickStartCommands : configurationCommands;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" appearance="flat">
      <header className="flex shrink-0 items-start justify-between gap-6 border-b border-white/[0.07] px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700">
            <HugeiconsIcon
              icon={CommandLineIcon}
              size={13}
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Tunnels / CLI
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">
            Open a new tunnel
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-zinc-600">
            Run these commands from the machine hosting your local service.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
          aria-label="Close"
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            size={16}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </button>
      </header>

      <nav
        className="flex shrink-0 gap-6 border-b border-white/[0.07] px-5 sm:px-6"
        aria-label="Tunnel setup"
        role="tablist"
      >
        {[
          { id: "quick-start", label: "Quick start" },
          { id: "configuration", label: "Configuration" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(tab.id as "quick-start" | "configuration")
              }
              className={`relative py-3 text-[11px] font-medium transition-colors ${
                isActive
                  ? "text-zinc-200"
                  : "text-zinc-700 hover:text-zinc-400"
              }`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.label}
              {isActive && (
                <motion.span
                  layoutId="new-tunnel-active-tab"
                  className="absolute inset-x-0 -bottom-px h-px bg-white"
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="overflow-y-auto px-5 py-2 sm:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.ol
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="divide-y divide-white/[0.07]"
          >
            {commands.map((item, index) => {
              const isCopied = copiedCommand === item.id;

              return (
                <li
                  key={item.id}
                  className="grid gap-3 py-5 sm:grid-cols-[24px_minmax(0,1fr)] sm:gap-4"
                >
                  <span className="font-mono text-[10px] leading-5 text-zinc-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-medium text-zinc-300">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                      {item.description}
                    </p>

                    <div className="mt-3 flex min-w-0 items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.02] py-2 pl-3 pr-1.5 transition-colors hover:border-white/[0.12]">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-zinc-300 [scrollbar-width:none]">
                        {item.command}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.command, item.id)}
                        className={`flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[10px] font-medium transition-colors ${
                          isCopied
                            ? "text-emerald-400"
                            : "text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"
                        }`}
                        aria-label={`Copy ${item.title} command`}
                      >
                        <HugeiconsIcon
                          icon={isCopied ? Tick02Icon : Copy01Icon}
                          size={13}
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span className="hidden sm:inline">
                          {isCopied ? "Copied" : "Copy"}
                        </span>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </motion.ol>
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 items-start gap-3 border-t border-white/[0.07] px-5 py-4 sm:px-6">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
        <p className="text-[11px] leading-5 text-zinc-600">
          Connected tunnels appear here automatically. Press{" "}
          <kbd className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            Ctrl+C
          </kbd>{" "}
          in the terminal to close one.
        </p>
      </footer>
    </Modal>
  );
}
