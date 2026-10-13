import { lazy, Suspense } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import { useAgentChatState } from "./agent-chat-context";

const AgentChatPanel = lazy(() => import("./agent-chat-panel"));

/** Motion keeps the modal mounted through its exit. Chat content stays lazy. */
export function AgentChatHost() {
  const { state, dispatch, panelId, returnFocusRef } = useAgentChatState();
  const reducedMotion = useReducedMotion();
  const close = () => dispatch({ type: "close" });
  const restoreFocus = () => {
    const target = returnFocusRef.current?.isConnected && !document.getElementById(panelId)?.contains(returnFocusRef.current)
      ? returnFocusRef.current : document.querySelector<HTMLElement>("[data-agent-trigger]");
    target?.focus();
  };

  return <Dialog.Root open={state.panelOpen} onOpenChange={(open) => { if (!open) close(); }}>
    <AnimatePresence>
      {state.panelOpen && <Dialog.Portal key="agent-chat" forceMount>
        <Dialog.Overlay asChild forceMount>
          <motion.div
            className="fixed inset-0 z-80 bg-black/40 data-[state=closed]:pointer-events-none!"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { type: "tween", duration: reducedMotion ? 0 : 0.16, ease: "easeOut" } }}
            transition={{ type: "tween", duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild forceMount id={panelId} aria-describedby={undefined} onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}>
          <motion.div
            className={`${workspaceScopeClassName} ph-no-capture fixed inset-y-0 right-0 z-81 flex h-dvh w-full max-w-[720px] flex-col border-l border-white/[0.08] bg-[#111112] text-zinc-200 shadow-[-24px_0_80px_rgba(0,0,0,0.3)] outline-none data-[state=closed]:pointer-events-none!`}
            initial={reducedMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reducedMotion ? 0 : "100%", transition: { type: "tween", duration: reducedMotion ? 0 : 0.18, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "tween", duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <Dialog.Title className="sr-only">Agent chat</Dialog.Title>
            <Suspense fallback={<AgentPanelLoading />}><AgentChatPanel onClose={close} /></Suspense>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>}
    </AnimatePresence>
  </Dialog.Root>;
}

function AgentPanelLoading() {
  return <div aria-label="Loading Agent" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 lg:h-11"><span role="status" className="text-[13px] text-zinc-400">Loading Agent…</span><Dialog.Close aria-label="Close Agent" className="flex size-9 items-center justify-center rounded-lg border-0 bg-transparent text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none"><X size={17} aria-hidden="true" /></Dialog.Close></div>
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-5 sm:px-8"><div className="h-5 w-44 max-w-full animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /><div className="h-4 w-64 max-w-full animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" /></div>
    <div aria-hidden="true" className="shrink-0 border-t border-white/[0.07] p-4"><div className="h-[92px] rounded-xl border border-white/[0.08] bg-white/[0.025]" /></div>
  </div>;
}
