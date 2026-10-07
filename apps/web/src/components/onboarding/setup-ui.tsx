import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Terminal } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Button } from "../arc/button/button";
import { CopyButton } from "../arc/copy-button/copy-button";
import "../outray-arc-theme.css";

interface SetupFlowStep {
  id: string;
  title: string;
  description?: string;
}

const SetupFlowContext = createContext<{
  activeId: string;
  id: string;
} | null>(null);

export function SetupFlow({
  steps,
  children,
  onRecheck,
  buttonSize = "md",
}: {
  steps: readonly SetupFlowStep[];
  children: ReactNode;
  onRecheck?: () => void;
  buttonSize?: "sm" | "md";
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState(steps[0]?.id ?? "");
  const selectedIndex = Math.max(0, steps.findIndex((step) => step.id === selectedId));
  const activeId = steps[selectedIndex]?.id ?? "";
  const isFinalStep = selectedIndex === steps.length - 1;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = steps.length - 1;
    const next = event.key === "ArrowRight"
      ? (selectedIndex + 1) % steps.length
      : event.key === "ArrowLeft"
        ? (selectedIndex + last) % steps.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? last
            : -1;
    if (next < 0 || !steps[next]) return;
    event.preventDefault();
    setSelectedId(steps[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <SetupFlowContext.Provider value={{ activeId, id }}>
      <section className="outray-arc min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0b0b]" aria-label="Setup guide">
        <div role="tablist" aria-label="Setup steps" aria-orientation="horizontal" className="flex min-w-0 gap-1 overflow-x-auto border-b border-white/[0.07] p-2 [scrollbar-width:thin]">
          <LayoutGroup id={id}>
            {steps.map((step, index) => {
              const selected = index === selectedIndex;
              return (
                <button
                  key={step.id}
                  ref={(element) => { tabs.current[index] = element; }}
                  id={`${id}-tab-${step.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${id}-panel-${step.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setSelectedId(step.id)}
                  onKeyDown={handleKeyDown}
                  title={step.description}
                  className={`relative isolate inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-[12px] transition-colors motion-reduce:transition-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${selected ? "text-zinc-100" : "text-zinc-400 hover:bg-white/[0.025] hover:text-zinc-300"}`}
                >
                  {selected && <motion.span layoutId="setup-selection" transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }} aria-hidden="true" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.06]" />}
                  <span aria-hidden="true" className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] ${selected ? "bg-white/[0.08] text-zinc-300" : "text-zinc-600"}`}>
                    {index + 1}
                  </span>
                  <span>{step.title}</span>
                </button>
              );
            })}
          </LayoutGroup>
        </div>
        {children}
        {steps.length > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/[0.07] px-5 py-3.5 sm:px-6">
            <Button size={buttonSize} variant="ghost" disabled={selectedIndex === 0} onClick={() => setSelectedId(steps[selectedIndex - 1].id)}>
              <ArrowLeft size={14} aria-hidden="true" /> Back
            </Button>
            <span aria-live="polite" className="min-w-14 text-center text-[11px] tabular-nums text-zinc-400">
              {selectedIndex + 1} of {steps.length}
            </span>
            <Button size={buttonSize} variant="secondary" disabled={isFinalStep && !onRecheck} onClick={isFinalStep ? onRecheck : () => setSelectedId(steps[selectedIndex + 1].id)}>
              {isFinalStep && onRecheck ? <><RefreshCw size={13} aria-hidden="true" /> Check connection</> : <>Next step <ArrowRight size={14} aria-hidden="true" /></>}
            </Button>
          </div>
        )}
      </section>
    </SetupFlowContext.Provider>
  );
}

/** Hidden panels stay mounted: changing instructions must never erase a form. */
export function SetupStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  const flow = useContext(SetupFlowContext);
  return (
    <div
      role={flow ? "tabpanel" : undefined}
      id={flow ? `${flow.id}-panel-${number}` : undefined}
      aria-labelledby={flow ? `${flow.id}-tab-${number}` : undefined}
      tabIndex={flow ? 0 : undefined}
      hidden={flow ? flow.activeId !== number : undefined}
      className="min-h-[220px] min-w-0 p-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:p-6"
      data-setup-step={number}
    >
      <h2 className="mb-3 text-[14px] font-medium tracking-[-0.015em] text-zinc-200">{title}</h2>
      {children}
    </div>
  );
}

export function SetupCodeBlock({
  children,
  multiline = false,
  fileName,
}: {
  children: string;
  multiline?: boolean;
  fileName?: string;
}) {
  return (
    <div className="outray-arc min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#080808]">
      {fileName && <div className="border-b border-white/[0.06] px-3.5 py-2 font-mono text-[11px] text-zinc-400">{fileName}</div>}
      <div className="flex min-w-0 items-start gap-2.5 p-3.5">
        {!multiline && <Terminal size={14} className="mt-2 shrink-0 text-zinc-600" aria-hidden="true" />}
        <pre tabIndex={0} aria-label={fileName ? `Code for ${fileName}` : multiline ? "Code example" : "Terminal command"} className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[12px] leading-5 text-zinc-300 [scrollbar-width:thin] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><code>{children}</code></pre>
        <CopyButton value={children} iconOnly variant="plain" label={fileName ? `Copy ${fileName}` : multiline ? "Copy code" : "Copy command"} className="shrink-0" />
      </div>
    </div>
  );
}
