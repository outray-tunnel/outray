import { useCallback, useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUp, Clock3, ExternalLink, MessageSquare, MessageSquarePlus, Sparkles, Square, X } from "lucide-react";
import { Button } from "../arc/button/button";
import { CopyButton } from "../arc/copy-button/copy-button";
import { WorkspaceTextarea } from "../ui/workspace-input";
import { AGENT_MAX_PROMPT_LENGTH, createAgentThread, isAgentThreadPreparing, safeAgentEvidenceHref, type AgentMessage, type AgentThread } from "./agent-chat-data";
import { AgentPreparation } from "./agent-preparation";
import { newAgentId, useAgentChat, useAgentChatState } from "./agent-chat-context";
import "../outray-arc-theme.css";
import styles from "./agent-chat-panel.module.css";

const iconButton = "flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none";

export default function AgentChatPanel() {
  const { state, dispatch, panelId, returnFocusRef } = useAgentChatState();
  const restoreFocus = () => {
    const target = returnFocusRef.current?.isConnected && !document.getElementById(panelId)?.contains(returnFocusRef.current)
      ? returnFocusRef.current : document.querySelector<HTMLElement>("[data-agent-trigger]");
    target?.focus();
  };
  const close = () => {
    dispatch({ type: "close" });
  };

  // A viewport overlay on every screen: opening chat never resizes the workspace.
  return <Dialog.Root open={state.panelOpen} onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={`${styles.overlay} fixed inset-0 z-[80] bg-black/40`} />
      <Dialog.Content id={panelId} aria-describedby={undefined} onCloseAutoFocus={(event) => {
        event.preventDefault();
        restoreFocus();
      }} className={`${styles.panel} workspace-ui outray-arc ph-no-capture fixed inset-y-0 right-0 z-[81] flex h-dvh w-full max-w-[720px] flex-col border-l border-white/[0.08] bg-[#111112] text-zinc-200 shadow-[-24px_0_80px_rgba(0,0,0,0.3)] outline-none`}>
        <Dialog.Title className="sr-only">Agent chat</Dialog.Title>
        <AgentPanelContent onClose={close} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function AgentPanelContent({ onClose }: { onClose: () => void }) {
  const { state, dispatch, orgSlug, sendMessage, stopResponse, loadHistory } = useAgentChatState();
  const { startThread } = useAgentChat();
  const thread = state.threads.find((item) => item.id === state.activeThreadId) ?? null;
  const scrollArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const draft = thread?.draft ?? "";
  const messageCount = thread?.messages.length ?? 0;
  const activeId = thread?.id;
  const preparing = isAgentThreadPreparing(thread);
  const awaitingServer = thread?.messages.some((message) => message.role === "assistant" && message.status === "running" && !message.localStreaming) ?? false;
  const responseCount = thread?.messages.filter((message) => message.role === "assistant" && message.status === "complete").length ?? 0;
  const lastTextLength = thread?.messages.at(-1)?.text.length ?? 0;
  const followStream = useRef(true);
  useEffect(() => {
    if (!state.historyOpen) composer.current?.focus({ preventScroll: true });
  }, [activeId, state.historyOpen]);
  useEffect(() => {
    followStream.current = true;
    if (!state.historyOpen && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [activeId, messageCount, state.historyOpen]);
  useEffect(() => {
    if (!state.historyOpen && followStream.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [lastTextLength, state.historyOpen]);

  const send = useCallback((text = thread?.draft ?? "") => {
    if (!text.trim() || isAgentThreadPreparing(thread)) return;
    sendMessage(text);
    composer.current?.focus({ preventScroll: true });
  }, [thread, sendMessage]);
  const changeDraft = useCallback((value: string) => {
    if (thread) dispatch({ type: "draft", id: thread.id, value });
    else {
      const next = createAgentThread({ id: newAgentId(), at: Date.now() });
      dispatch({ type: "create", thread: { ...next, draft: value } });
    }
  }, [thread, dispatch]);

  return <>
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.08] px-4 lg:h-11">
      <Sparkles size={15} className="text-zinc-300" aria-hidden="true" />
      <h2 className="text-[13px] font-medium text-zinc-100">Agent</h2>
      {state.model && <span className="truncate text-[10px] text-zinc-600" title={state.model}>{state.model}</span>}
      <div className="ml-auto flex items-center gap-0.5">
        <button type="button" className={iconButton} aria-label="New chat" title="New chat" onClick={() => startThread()}><MessageSquarePlus size={16} aria-hidden="true" /></button>
        <button type="button" className={iconButton} aria-label="Chat history" title="Chat history" aria-pressed={state.historyOpen} onClick={() => dispatch({ type: "history", open: !state.historyOpen })}><Clock3 size={16} aria-hidden="true" /></button>
        <button type="button" className={iconButton} aria-label="Close Agent" title="Close Agent" onClick={onClose}><X size={17} aria-hidden="true" /></button>
      </div>
    </header>

    {state.historyError || state.configured === false ? <div role="alert" className="shrink-0 border-b border-white/[0.06] px-5 py-3 text-[12px] leading-5 text-amber-200/75"><p>{state.historyError ?? "Agent is not configured. Ask your workspace administrator to configure the AI provider on the server."}</p>{state.historyError && <button type="button" onClick={() => void loadHistory()} className="mt-1 rounded text-zinc-400 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-zinc-400">Retry loading chats</button>}</div> : null}
    {state.historyOpen ? <AgentHistory threads={state.threads} activeId={state.activeThreadId} loading={state.historyStatus === "loading"} onSelect={(id) => dispatch({ type: "select", id })} onNew={() => startThread()} onBack={() => dispatch({ type: "history", open: false })} /> : <>
      {thread?.messages.length ? <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <h3 className="min-w-0 flex-1 truncate text-[12px] text-zinc-400" title={thread.title}>{thread.title}</h3>
        {thread.sourceRequestId && <Link to="/$orgSlug/observability/requests" params={{ orgSlug }} search={{ search: thread.context ? new URLSearchParams(thread.context.sourceHref.split("?")[1]).get("search") ?? thread.sourceRequestId : thread.sourceRequestId, range: "30d" }} aria-label="View source request" title="View source request" className={iconButton}><ExternalLink size={13} aria-hidden="true" /></Link>}
      </div> : null}
      {awaitingServer && <div role="status" className="shrink-0 border-b border-white/[0.06] px-5 py-3 text-[12px] leading-5 text-zinc-500">A saved response is still running on the server. <button type="button" onClick={() => void loadHistory()} disabled={state.historyStatus === "loading"} className="rounded text-zinc-400 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-zinc-400">Refresh chats</button> to check its status.</div>}
      <div ref={scrollArea} onScroll={(event) => { const area = event.currentTarget; followStream.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
        {thread?.messages.length ? <AgentConversation thread={thread} orgSlug={orgSlug} onFollowUp={send} /> : <AgentWelcome onSuggestion={send} />}
      </div>
      <AgentComposer value={draft} onChange={changeDraft} onSend={() => send()} onStop={() => { if (thread) stopResponse(thread.id); }} inputRef={composer} preparing={preparing} />
      <p role="status" aria-live="polite" className="sr-only">{preparing ? "Agent is responding." : responseCount ? `${responseCount} responses in this chat.` : "New chat ready."}</p>
    </>}
  </>;
}

export function AgentWelcome({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return <section aria-label="Start a chat" className="flex min-h-full flex-col justify-center pb-8">
    <div className="mb-5 flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-zinc-300"><Sparkles size={19} strokeWidth={1.5} aria-hidden="true" /></div>
    <h3 className="text-[20px] font-normal tracking-[-0.035em] text-zinc-100">What are we looking into?</h3>
    <p className="mt-2 text-[13px] leading-6 text-zinc-500">Start a conversation here, or use Ask agent on a request to bring its context into a new chat.</p>
    <div className="mt-7 space-y-2">
      {["Help me investigate a slow request", "What should I check after a failed request?", "What can you help me with?"].map((text) => <button key={text} type="button" onClick={() => onSuggestion(text)} className="group flex w-full items-center justify-between gap-3 rounded-lg border border-white/[0.07] px-3 py-3 text-left text-[12px] text-zinc-400 transition-colors hover:border-white/[0.12] hover:bg-white/[0.03] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none">{text}<ArrowUp size={13} className="shrink-0 rotate-45 text-zinc-600 group-hover:text-zinc-400" aria-hidden="true" /></button>)}
    </div>
  </section>;
}

export function AgentConversation({ thread, orgSlug = "", onFollowUp }: { thread: AgentThread; orgSlug?: string; onFollowUp: (text: string) => void }) {
  const lastMessage = thread.messages.at(-1);
  return <div aria-label="Chat messages" className="space-y-7">
    {thread.sourceRequestId && <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[11px] text-zinc-500"><MessageSquare size={13} className="mt-0.5 shrink-0" aria-hidden="true" /><div className="min-w-0"><p className="break-words font-mono text-zinc-300">{thread.context?.label ?? "Attached request"}</p><p className="mt-1">{thread.context ? [thread.context.request.service, thread.context.request.environment].filter(Boolean).join(" · ") || "Request context" : "Request context"} · Attached from this workspace</p></div></div>}
    {thread.messages.map((message) => <AgentMessageView key={message.id} message={message} orgSlug={orgSlug} />)}
    {thread.sourceRequestId && lastMessage?.role === "assistant" && lastMessage.status === "complete" && <div aria-label="Suggested follow-ups" className="flex flex-wrap gap-2">{["What is confirmed by the evidence?", "What should I check next?"].map((label) => <button key={label} type="button" onClick={() => onFollowUp(label)} className="rounded-lg border border-white/[0.08] px-2.5 py-2 text-left text-[11px] text-zinc-400 transition-colors hover:bg-white/[0.035] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none">{label}</button>)}</div>}
  </div>;
}

export function AgentMessageView({ message, orgSlug = "" }: { message: AgentMessage; orgSlug?: string }) {
  if (message.role === "user") return <article aria-label="Your message" className="ml-8 rounded-xl border border-white/[0.04] bg-white/[0.05] px-3.5 py-3"><p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-200">{message.text}</p></article>;
  const preparing = message.status === "running" && message.localStreaming === true;
  const evidence = message.evidence.flatMap((item) => { const href = safeAgentEvidenceHref(item.href, orgSlug); return href ? [{ ...item, href }] : []; });
  return <article aria-label="Agent response" aria-busy={preparing} className="min-w-0">
    <div className="mb-2.5 flex items-center gap-2 text-[11px] text-zinc-500"><Sparkles size={12} className="text-zinc-400" aria-hidden="true" /><span>Agent</span></div>
    {(message.steps.length > 0 || preparing && !message.text) && <div className="mb-4"><AgentPreparation steps={message.steps} complete={!preparing} /></div>}
    {message.text && <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-300">{message.text}</p>}
    {evidence.length > 0 && <nav aria-label="Observed evidence" className="mt-4 flex flex-wrap gap-2">{evidence.map((item) => <a key={item.id} href={item.href} title={item.observedAt ? `Observed ${item.observedAt}` : undefined} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-[11px] text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400"><span>{item.label}</span><ExternalLink size={11} aria-hidden="true" /></a>)}</nav>}
    {message.status === "failed" || message.status === "cancelled" ? <p role="alert" className="mt-3 text-[12px] leading-5 text-amber-200/70">{message.error ?? (message.status === "cancelled" ? "Response stopped." : "This response could not be completed. Please try again.")}</p> : null}
    {message.status === "running" && !message.localStreaming && <p className="mt-3 text-[12px] leading-5 text-zinc-500">This saved response has not finished yet.</p>}
    {!preparing && message.text && <div className="mt-2"><CopyButton iconOnly variant="plain" label="Copy response" value={message.text} className="!size-7" /></div>}
  </article>;
}

export function AgentHistory({ threads, activeId, loading = false, onSelect, onNew, onBack }: { threads: AgentThread[]; activeId: string | null; loading?: boolean; onSelect: (id: string) => void; onNew: () => void; onBack: () => void }) {
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center gap-2 px-4 py-3"><button type="button" aria-label="Back to chat" className={iconButton} onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /></button><h3 className="text-[13px] text-zinc-300">Chats</h3><Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={onNew}><MessageSquarePlus size={12} aria-hidden="true" />New chat</Button></div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">{loading && <p role="status" className="px-4 py-3 text-[12px] text-zinc-500">Loading saved chats…</p>}{threads.length ? threads.map((thread) => <button key={thread.id} type="button" onClick={() => onSelect(thread.id)} aria-current={activeId === thread.id ? "true" : undefined} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-400 motion-reduce:transition-none ${activeId === thread.id ? "bg-white/[0.055]" : ""}`}><MessageSquare size={14} className="mt-1 shrink-0 text-zinc-500" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-zinc-300">{thread.title}</span><span className="mt-1 block truncate text-[11px] text-zinc-500">{thread.sourceRequestId ? "Request conversation" : "General conversation"}{isAgentThreadPreparing(thread) ? " · Responding" : thread.draft ? " · Draft" : ""}</span></span></button>) : !loading && <div className="px-4 py-10"><p className="text-[13px] text-zinc-300">No conversations yet</p><p className="mt-2 text-[12px] leading-6 text-zinc-500">Start a chat here, or ask about a request. Each contextual question gets its own thread.</p></div>}</div>
    <p className="border-t border-white/[0.06] px-5 py-4 text-[11px] leading-5 text-zinc-600">Sent conversations are saved to your account in this workspace. Unsent drafts stay in this tab.</p>
  </div>;
}

export function AgentComposer({ value, onChange, onSend, onStop, inputRef, preparing = false }: { value: string; onChange: (value: string) => void; onSend: () => void; onStop?: () => void; inputRef?: Ref<HTMLTextAreaElement>; preparing?: boolean }) {
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (value.trim() && !preparing) onSend();
    }
  }
  return <div className="shrink-0 border-t border-white/[0.07] px-4 pt-4" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
    <form aria-label="Message Agent" onSubmit={(event) => { event.preventDefault(); if (value.trim() && !preparing) onSend(); }}>
      <div className="relative">
        <WorkspaceTextarea ref={inputRef} aria-label="Message Agent" placeholder="Ask a question…" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={keyDown} maxLength={AGENT_MAX_PROMPT_LENGTH} rows={3} autoComplete="off" className="!min-h-[92px] !resize-none !rounded-xl !pr-12 !text-[13px]" />
        {preparing ? <Button type="button" size="sm" aria-label="Stop response" title="Stop response" onClick={onStop} className="!absolute bottom-2.5 right-2.5 !size-8 !min-w-0 !px-0"><Square size={11} fill="currentColor" aria-hidden="true" /></Button> : <Button type="submit" size="sm" aria-label="Send message" disabled={!value.trim()} className="!absolute bottom-2.5 right-2.5 !size-8 !min-w-0 !px-0"><ArrowUp size={15} aria-hidden="true" /></Button>}
      </div>
    </form>
    <p className="mt-2.5 text-center text-[10px] leading-4 text-zinc-600">AI can make mistakes. Verify conclusions against the evidence.</p>
  </div>;
}
