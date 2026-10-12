import { lazy, Suspense } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { workspaceScopeClassName } from "../ui/workspace-scope";
import { useAgentChatState } from "./agent-chat-context";

const AgentChatPanel = lazy(() => import("./agent-chat-panel"));

/** Keep the modal shell mounted so Radix can finish both animations. Chat content stays lazy. */
export function AgentChatHost() {
  const { state, dispatch, panelId, returnFocusRef } = useAgentChatState();
  const close = () => dispatch({ type: "close" });
  const restoreFocus = () => {
    const target = returnFocusRef.current?.isConnected && !document.getElementById(panelId)?.contains(returnFocusRef.current)
      ? returnFocusRef.current : document.querySelector<HTMLElement>("[data-agent-trigger]");
    target?.focus();
  };

  return <Dialog.Root open={state.panelOpen} onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-80 bg-black/40 opacity-100 transition-opacity starting:opacity-0 data-[state=open]:duration-[260ms] data-[state=open]:ease-out data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=closed]:duration-[190ms] data-[state=closed]:ease-in motion-reduce:transition-none" />
      <Dialog.Content id={panelId} aria-describedby={undefined} onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }} className={`${workspaceScopeClassName} ph-no-capture fixed inset-y-0 right-0 z-81 flex h-dvh w-full max-w-[720px] translate-x-0 flex-col border-l border-white/[0.08] bg-[#111112] text-zinc-200 shadow-[-24px_0_80px_rgba(0,0,0,0.3)] outline-none transition-transform starting:translate-x-full data-[state=open]:duration-[260ms] data-[state=open]:ease-[cubic-bezier(.22,1,.36,1)] data-[state=closed]:pointer-events-none data-[state=closed]:translate-x-full data-[state=closed]:duration-[190ms] data-[state=closed]:ease-[cubic-bezier(.4,0,1,1)] motion-reduce:transition-none`}>
        <Dialog.Title className="sr-only">Agent chat</Dialog.Title>
        <Suspense fallback={<AgentPanelLoading />}><AgentChatPanel onClose={close} /></Suspense>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function AgentPanelLoading() {
  return <div aria-label="Loading Agent" aria-busy="true" className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 lg:h-11"><span role="status" className="text-[13px] text-zinc-400">Loading Agent…</span><Dialog.Close aria-label="Close Agent" className="flex size-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none"><X size={17} aria-hidden="true" /></Dialog.Close></div>
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-5 sm:px-8"><div className="h-5 w-44 max-w-full animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /><div className="h-4 w-64 max-w-full animate-pulse rounded bg-white/[0.035] motion-reduce:animate-none" /></div>
    <div aria-hidden="true" className="shrink-0 border-t border-white/[0.07] p-4"><div className="h-[92px] rounded-xl border border-white/[0.08] bg-white/[0.025]" /></div>
  </div>;
}
