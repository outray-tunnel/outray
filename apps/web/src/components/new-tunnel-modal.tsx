import { X, Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Modal, ModalHeader, IconButton } from "@/components/ui";

export function NewTunnelModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"basic" | "advanced">("basic");

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(id);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const basicSteps = [
    {
      id: "install",
      title: "Install the CLI",
      command: "npm install -g outray",
      description: "Install the OutRay CLI globally on your machine.",
    },
    {
      id: "login",
      title: "Login",
      command: "outray login",
      description: "Authenticate with your account.",
    },
    {
      id: "start",
      title: "Start a Tunnel",
      command: "outray 8000",
      description: "Expose your local server running on port 8000.",
    },
  ];

  const advancedCommands = [
    {
      id: "subdomain",
      title: "Custom Subdomain",
      command: "outray 8000 --subdomain my-app",
      description: "Get a consistent URL like https://my-app.outray.dev",
    },
    {
      id: "domain",
      title: "Custom Domain",
      command: "outray 8000 --domain app.example.com",
      description: "Use your own domain name (requires configuration)",
    },
    {
      id: "org",
      title: "Specific Organization",
      command: "outray 8000 --org my-team",
      description: "Start a tunnel for a specific organization",
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader
        icon={<Terminal size={20} />}
        iconClassName="bg-white/5 text-white"
        title="Create New Tunnel"
        description="Command line interface instructions"
        onClose={onClose}
      />

      <div className="flex border-b border-white/5 shrink-0">
        <button
          onClick={() => setActiveTab("basic")}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "basic"
              ? "text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Basic Setup
          {activeTab === "basic" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("advanced")}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "advanced"
              ? "text-white"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          Advanced Usage
          {activeTab === "advanced" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
            />
          )}
        </button>
      </div>

      <div className="p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === "basic" ? (
            <motion.div
              key="basic"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {basicSteps.map((step, index) => (
                <div key={step.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-xs">
                      {index + 1}
                    </span>
                    {step.title}
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-linear-to-r from-accent/10 to-purple-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative bg-black/40 border border-white/10 rounded-xl p-3 flex items-center justify-between group-hover:border-white/20 transition-colors">
                      <code className="text-sm font-mono text-accent">
                        {step.command}
                      </code>
                      <IconButton
                        onClick={() => copyToClipboard(step.command, step.id)}
                        icon={
                          copiedStep === step.id ? (
                            <Check size={16} className="text-green-500" />
                          ) : (
                            <Copy size={16} />
                          )
                        }
                        size="sm"
                        aria-label="Copy command"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 ml-7">
                    {step.description}
                  </p>
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {advancedCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="bg-white/2 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-white">
                      {cmd.title}
                    </h3>
                    <IconButton
                      onClick={() => copyToClipboard(cmd.command, cmd.id)}
                      icon={
                        copiedStep === cmd.id ? (
                          <Check size={16} className="text-green-500" />
                        ) : (
                          <Copy size={16} />
                        )
                      }
                      size="sm"
                      aria-label="Copy command"
                    />
                  </div>
                  <div className="bg-black/40 rounded-lg p-2.5 mb-2 border border-white/5">
                    <code className="text-sm font-mono text-accent">
                      {cmd.command}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500">{cmd.description}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-6 border-t border-white/5 bg-white/2 shrink-0">
        <div className="flex items-start gap-3 text-sm text-gray-500">
          <div className="mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          </div>
          <p>
            Once you start the tunnel, it will automatically appear in your
            dashboard. You can stop it anytime with{" "}
            <code className="text-xs bg-white/10 px-1 py-0.5 rounded text-gray-300">
              Ctrl+C
            </code>
          </p>
        </div>
      </div>
    </Modal>
  );
}
