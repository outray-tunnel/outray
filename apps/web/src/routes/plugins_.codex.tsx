import { createFileRoute } from "@tanstack/react-router";
import { PluginShell } from "@/components/mcp/plugin-shell";

export const Route = createFileRoute("/plugins_/codex")({ component: CodexPluginPage,
  head: () => ({ meta: [{ title: "OutRay for Codex and ChatGPT" }, { name: "description", content: "Manage OutRay tunnels, telemetry, uptime and organization resources from Codex and ChatGPT." }] }),
});
function CodexPluginPage() {
  return <PluginShell title="OutRay, where you build" description="Connect your OutRay account to Codex and ChatGPT.">
    <p className="mb-6 text-[13px] leading-6 text-zinc-400">Investigate errors, manage uptime, and work with your organization’s developer tools from a conversation.</p>
    <div className="mb-8 grid gap-5 sm:grid-cols-2">{[
      ["Share local development", "Create HTTP, TCP and UDP tunnels with the OutRay CLI when your chat has local execution."],
      ["Investigate your services", "Inspect request, trace, metric and log evidence, then configure SDKs and alerts."],
      ["Manage availability", "Work with uptime monitors, status pages and incident updates."],
      ["Administer your workspace", "Manage vault metadata, domains, memberships and selected organization resources."],
    ].map(([title, description]) => <section key={title} className="rounded-[14px] border border-white/[.08] bg-[#101010] p-5"><h2 className="mb-2 text-[13px] font-medium text-zinc-200">{title}</h2><p className="text-xs leading-6 text-zinc-400">{description}</p></section>)}</div>
    <h2 className="mb-3 text-[13px] font-medium text-zinc-200">Connect with OAuth</h2>
    <p className="mb-4 text-sm leading-6 text-zinc-400">Use the OutRay plugin when available in your host’s plugin directory. Sign in to OutRay, choose organizations, and review the requested access. The plugin keeps your organization permissions in effect.</p>
    <p className="mb-6 text-sm leading-6 text-zinc-400">For a direct MCP connection, configure your client with <code className="break-all text-zinc-200">https://outray.co/api/mcp</code> and complete OAuth sign-in. Direct connections can request explicit access to secret values. The public plugin uses a restricted catalog without secret-value tools.</p>
    <p className="mb-6 text-sm leading-6 text-zinc-400">Local workflows require the OutRay CLI and access to your development machine. Hosted platform tools work without a local runtime. Keep secret injection inside the CLI; never paste credentials into a conversation.</p>
    <a className="inline-flex min-h-9 items-center rounded-xl border border-zinc-50 bg-zinc-50 px-4 text-[13px] font-medium text-zinc-950 transition-opacity hover:opacity-90 motion-reduce:transition-none" href="/plugins/connections">Manage connected apps</a>
    <p className="mt-6 text-xs text-zinc-500">OutRay is the developer and operator of this integration. Availability in external directories depends on review and publication.</p>
  </PluginShell>;
}
