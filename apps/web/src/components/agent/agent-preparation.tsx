import { Check, ChevronDown, X } from "lucide-react";
import type { AgentStep } from "../../lib/agent/protocol";

/** Presentation only: every displayed step comes from a real backend operation. */
export function AgentPreparation({ steps, complete = false }: { steps: AgentStep[]; complete?: boolean }) {
  if (!steps.length) return complete ? null : <p role="status" aria-live="polite" className="text-[12px] leading-6 text-zinc-500">Connecting to Agent…</p>;
  const active = steps.find((step) => step.status === "running");
  const items = steps.map((step) => <li key={step.id} className={`flex items-start gap-2.5 text-[12px] leading-6 ${step.status === "complete" ? "text-zinc-400" : step.status === "failed" ? "text-amber-200/70" : "text-zinc-300"}`}>
    <span className="mt-1 flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
      {step.status === "complete" ? <Check size={13} strokeWidth={1.8} className="text-emerald-400/75" /> : step.status === "failed" ? <X size={12} /> : <span className={`size-1.5 rounded-full bg-purple-300/70 ${complete ? "" : "animate-pulse motion-reduce:animate-none"}`} />}
    </span>
    <span>{step.label}{step.detail && <span className="block text-[11px] text-zinc-500">{step.detail}</span>}</span>
  </li>);
  if (complete) return <details className="group">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-[12px] leading-6 text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
      <span>{steps.length} investigation {steps.length === 1 ? "step" : "steps"}</span><ChevronDown size={12} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    <ol aria-label="Investigation steps" className="mt-2 space-y-1">{items}</ol>
  </details>;
  return <div className="space-y-2"><p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{active?.label ?? "Preparing response"}</p><ol aria-label="Investigation steps" className="space-y-1">{items}</ol></div>;
}
