export interface AgentConfig {
  configured: boolean;
  model: string;
  apiKey: string | undefined;
  timeoutMs: number;
  maxSteps: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
}

/** Server-only settings. Never serialize this object into a response. */
export function readAgentConfig(env: Record<string, string | undefined> = process.env): AgentConfig {
  const model = env.AGENT_GROK_MODEL?.trim() || "grok-4.7";
  const apiKey = env.XAI_API_KEY?.trim() || undefined;
  return {
    configured: env.AGENT_ENABLED !== "false" && !!apiKey && /^grok-[a-zA-Z0-9._-]{1,80}$/.test(model),
    model,
    apiKey,
    timeoutMs: 90_000,
    maxSteps: 6,
    maxToolCalls: 8,
    maxOutputTokens: 1_536,
    maxTotalTokens: 24_000,
  };
}

export const AGENT_UNCONFIGURED = "Agent is not configured. Add XAI_API_KEY to the server environment to enable it.";
