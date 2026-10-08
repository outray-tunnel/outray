import { createContext, useContext, type Dispatch, type RefObject } from "react";
import type { AgentChatAction, AgentChatState, AgentRequestContext } from "./agent-chat-data";

interface AgentChatActions {
  openAgent: () => void;
  startThread: (context?: AgentRequestContext) => void;
  isOpen: boolean;
  panelId: string;
}

export const AgentActionsContext = createContext<AgentChatActions | null>(null);
export const AgentStateContext = createContext<{ state: AgentChatState; dispatch: Dispatch<AgentChatAction>; orgSlug: string; panelId: string; returnFocusRef: RefObject<HTMLElement | null>; sendMessage: (text?: string) => void; stopResponse: (threadId: string) => void; loadHistory: () => Promise<void> } | null>(null);

export function newAgentId() { return crypto.randomUUID(); }

export function useAgentChat() {
  const value = useContext(AgentActionsContext);
  if (!value) throw new Error("Agent chat actions require AgentChatProvider");
  return value;
}

export function useAgentChatState() {
  const value = useContext(AgentStateContext);
  if (!value) throw new Error("Agent chat state requires AgentChatProvider");
  return value;
}
