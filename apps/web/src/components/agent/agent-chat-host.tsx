import { lazy, Suspense } from "react";
import { useAgentChat } from "./agent-chat-context";

const AgentChatPanel = lazy(() => import("./agent-chat-panel"));

/** The chat UI is fetched only when opened, not with every dashboard page. */
export function AgentChatHost() {
  const { isOpen, panelId } = useAgentChat();
  if (!isOpen) return null;
  return <Suspense fallback={<aside id={panelId} aria-label="Loading Agent" aria-busy="true" className="fixed inset-y-0 right-0 z-[81] h-dvh w-full max-w-[720px] border-l border-white/[0.07] bg-[#111112]"><div className="m-5 h-5 w-24 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /></aside>}><AgentChatPanel /></Suspense>;
}
