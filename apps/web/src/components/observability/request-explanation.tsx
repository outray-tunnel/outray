import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronDown, CircleHelp, Info, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "../arc/button/button";
import { CopyButton } from "../arc/copy-button/copy-button";
import { buildRequestExplanationPreview, type RequestExplanationPreview } from "./request-explanation-data";
import type { HttpRequestSummary, RequestDetailsResponse } from "./http-requests-data";

type EvidenceTarget = "response" | "context";
type PreviewPhase = "idle" | "preparing" | "ready";

const preparationSteps = ["Read request metadata", "Check available context", "Prepare explanation"];

/** A local interaction prototype. Nothing is submitted to a model or persisted. */
export function RequestExplanation({
  request,
  details,
  preview: samplePreview,
  onOpenEvidence,
  autoStart = false,
}: {
  request: HttpRequestSummary;
  details?: RequestDetailsResponse | null;
  /** Explicit sample scenarios only; real inspectors derive their own metadata facts. */
  preview?: RequestExplanationPreview;
  onOpenEvidence?: (target: EvidenceTarget) => void;
  autoStart?: boolean;
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<PreviewPhase>(autoStart ? "preparing" : "idle");
  const [step, setStep] = useState(0);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const preview = samplePreview ?? buildRequestExplanationPreview(request, details);

  useEffect(() => {
    if (phase !== "preparing") return;
    const delays = reducedMotion ? [0, 0, 0] : [320, 680, 1_080];
    const timers = [
      setTimeout(() => setStep(1), delays[0]),
      setTimeout(() => setStep(2), delays[1]),
      setTimeout(() => setPhase("ready"), delays[2]),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, reducedMotion]);

  const start = () => {
    setFollowUp(null);
    setStep(0);
    setPhase("preparing");
  };

  return (
    <section aria-label="Request explanation preview" className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141415]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-violet-300/10 bg-violet-300/[0.05] text-violet-300"><Sparkles size={15} strokeWidth={1.7} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-[13px] font-medium text-zinc-200">Explain this request</h2><span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-zinc-400">Prototype</span></div>
            <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">Local preview · No AI provider connected</p>
          </div>
        </div>
        <Button ref={trigger} type="button" variant="secondary" size="sm" loading={phase === "preparing"} onClick={start} aria-expanded={phase !== "idle"} aria-controls={id}>
          {phase === "ready" && <RotateCcw size={12} aria-hidden="true" />}
          {phase === "idle" ? "Explain request" : phase === "preparing" ? "Preparing preview" : "Run again"}
        </Button>
      </header>
      <div id={id} aria-busy={phase === "preparing"}>
        <AnimatePresence mode="wait" initial={false}>
          {phase === "preparing" && (
            <motion.div key="preparing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} className="border-t border-white/[0.06] px-4 py-5">
              <ol aria-label="Preparing local preview" className="space-y-3">
                {preparationSteps.map((label, index) => <li key={label} className="flex items-center gap-2.5 text-[12px]">
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded-full ${index < step ? "text-emerald-300" : index === step ? "text-violet-300" : "text-zinc-600"}`} aria-hidden="true">
                    {index < step ? <Check size={13} /> : <span className={`size-1.5 rounded-full bg-current ${index === step ? "animate-pulse motion-reduce:animate-none" : ""}`} />}
                  </span>
                  <span className={index <= step ? "text-zinc-300" : "text-zinc-600"}>{label}</span>
                </li>)}
              </ol>
              <p role="status" aria-live="polite" className="sr-only">{preparationSteps[step]}. Preparing a scripted local preview, not running an AI investigation.</p>
              <div aria-hidden="true" className="mt-5 space-y-2 animate-pulse motion-reduce:animate-none"><div className="h-3 w-3/4 rounded bg-white/[0.04]" /><div className="h-3 w-full rounded bg-white/[0.035]" /><div className="h-3 w-2/3 rounded bg-white/[0.035]" /></div>
              <Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => { setPhase("idle"); trigger.current?.focus(); }}>Cancel preview</Button>
            </motion.div>
          )}
          {phase === "ready" && (
            <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="border-t border-white/[0.06]">
              <p className="sr-only" role="status" aria-live="polite">Local explanation preview ready. {preview.title}</p>
              <RequestExplanationResult preview={preview} onOpenEvidence={onOpenEvidence} followUp={followUp} onFollowUp={setFollowUp} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

/** Kept separate so the result can be checked without starting timers or fetching telemetry. */
export function RequestExplanationResult({
  preview,
  onOpenEvidence,
  followUp = null,
  onFollowUp,
}: {
  preview: RequestExplanationPreview;
  onOpenEvidence?: (target: EvidenceTarget) => void;
  followUp?: string | null;
  onFollowUp?: (id: string | null) => void;
}) {
  const answer = preview.followUps.find((item) => item.id === followUp);
  const summary = [
    "OutRay request explanation — frontend prototype (not an AI diagnosis)",
    preview.title,
    preview.summary,
    "Observed evidence:",
    ...preview.evidence.map((item) => `${item.label}: ${item.value}. ${item.detail}`),
    ...(preview.hypothesis ? [`Unconfirmed possibility: ${preview.hypothesis.title}. ${preview.hypothesis.detail}`] : []),
    "Suggested next checks:",
    ...preview.nextChecks.map((item) => `- ${item}`),
    "Limitations:",
    ...preview.limitations.map((item) => `- ${item}`),
  ].join("\n");

  return <div className="space-y-5 p-4">
    <div><p className="mb-2 text-[11px] text-zinc-500">What we can see</p><h3 className="text-[16px] font-medium leading-6 tracking-[-0.02em] text-zinc-100">{preview.title}</h3><p className="mt-2 text-[13px] leading-6 text-zinc-400">{preview.summary}</p></div>

    {preview.hypothesis && <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/10 bg-amber-300/[0.025] p-3.5"><CircleHelp size={15} className="mt-0.5 shrink-0 text-amber-200/70" aria-hidden="true" /><div><p className="text-[11px] text-amber-200/70">Unconfirmed possibility</p><h4 className="mt-1 text-[13px] font-medium text-zinc-200">{preview.hypothesis.title}</h4><p className="mt-1 text-[12px] leading-5 text-zinc-400">{preview.hypothesis.detail}</p></div></div>}

    <section aria-label="Observed evidence">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[12px] font-medium text-zinc-300">Evidence</h4><span className="text-[11px] text-zinc-500">{onOpenEvidence ? "Select to inspect" : "Request metadata"}</span></div>
      <div className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.07]">
        {preview.evidence.map((item) => {
          const content = <><span className="min-w-0 flex-1"><span className="block text-[12px] text-zinc-300">{item.label}</span><span className="mt-0.5 block text-[11px] leading-5 text-zinc-500">{item.detail}</span></span><span className="max-w-[45%] shrink-0 break-words text-right font-mono text-[12px] text-zinc-300">{item.value}</span>{onOpenEvidence && <ArrowRight size={13} className="shrink-0 text-zinc-600 group-hover:text-zinc-300" aria-hidden="true" />}</>;
          return onOpenEvidence ? <button type="button" key={item.id} onClick={() => onOpenEvidence(item.target)} aria-label={`Inspect ${item.label} evidence`} className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none">{content}</button> : <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">{content}</div>;
        })}
      </div>
    </section>

    {preview.nextChecks.length > 0 && <section aria-label="Suggested next checks"><h4 className="mb-3 text-[12px] font-medium text-zinc-300">Suggested next checks</h4><ol className="space-y-3">{preview.nextChecks.map((check, index) => <li key={check} className="flex items-start gap-2.5"><span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-white/[0.07] text-[10px] tabular-nums text-zinc-500" aria-hidden="true">{index + 1}</span><p className="text-[12px] leading-5 text-zinc-400">{check}</p></li>)}</ol></section>}

    {preview.limitations.length > 0 && <details className="group rounded-lg border border-white/[0.06] bg-black/10"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] text-zinc-400 hover:text-zinc-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400 [&::-webkit-details-marker]:hidden"><Info size={13} aria-hidden="true" /><span className="flex-1">What this preview can’t tell you</span><ChevronDown size={13} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><ul className="space-y-2 border-t border-white/[0.05] px-3 py-3 text-[12px] leading-5 text-zinc-500">{preview.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>}

    {onFollowUp && <section aria-label="Follow-up questions"><h4 className="mb-2.5 text-[12px] font-medium text-zinc-300">Go a little deeper</h4><div className="flex flex-wrap gap-2">{preview.followUps.map((item) => <button type="button" key={item.id} aria-pressed={followUp === item.id} onClick={() => onFollowUp(followUp === item.id ? null : item.id)} className={`rounded-lg border px-2.5 py-2 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none ${followUp === item.id ? "border-violet-300/20 bg-violet-300/[0.07] text-zinc-200" : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"}`}>{item.label}</button>)}</div>{answer && <div role="status" aria-live="polite" className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5"><p className="text-[11px] text-zinc-500">Scripted follow-up</p><p className="mt-1.5 whitespace-pre-line text-[12px] leading-6 text-zinc-300">{answer.answer}</p></div>}</section>}

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3"><span className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Info size={12} aria-hidden="true" />Scripted preview, not a diagnosis</span><CopyButton value={summary} label="Copy summary" variant="plain" className="!text-xs" /></footer>
  </div>;
}
