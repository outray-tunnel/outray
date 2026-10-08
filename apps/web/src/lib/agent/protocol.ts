/** Browser-safe agent contracts. No credentials or server imports belong here. */
export type AgentRunStatus = "running" | "complete" | "failed" | "cancelled";

export interface AgentStep {
  id: string;
  label: string;
  status: "running" | "complete" | "failed";
  detail?: string;
}

export interface AgentEvidenceReference {
  id: string;
  label: string;
  href: string;
  observedAt: string;
}

export interface AgentSavedMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: AgentRunStatus;
  steps: AgentStep[];
  evidence: AgentEvidenceReference[];
  error?: string;
}

export interface AgentSavedThread {
  id: string;
  title: string;
  sourceRequestId: string | null;
  createdAt: number;
  updatedAt: number;
  messages: AgentSavedMessage[];
}

export interface AgentChatRequest {
  threadId: string;
  clientMessageId: string;
  assistantId: string;
  message: string;
  sourceRequestId?: string;
}

export type AgentStreamEvent =
  | { type: "run"; runId: string }
  | { type: "step"; step: AgentStep }
  | { type: "evidence"; evidence: AgentEvidenceReference[] }
  | { type: "text"; delta: string }
  | { type: "finish"; status: Exclude<AgentRunStatus, "running">; error?: string };

export interface AgentThreadListResponse {
  threads: AgentSavedThread[];
  configured: boolean;
  model: string | null;
}
