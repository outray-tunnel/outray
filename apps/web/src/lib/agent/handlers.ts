import { AGENT_UNCONFIGURED, readAgentConfig, type AgentConfig } from "./config";
import { createAgentEvidenceReader } from "./evidence";
import type { AgentEvidenceReference, AgentStep, AgentStreamEvent } from "./protocol";
import { runAgentInvestigation } from "./runtime";
import { AgentStoreError, type AgentScope, type AgentStore } from "./store";
import { AgentHttpError, readAgentRequest, redactAgentPrompt } from "./validation";

const privateHeaders = { "Cache-Control": "no-store", "Vary": "Cookie", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
interface AgentHandlersDependencies {
  authorize: (request: Request, orgSlug: string) => Promise<AgentScope | Response>;
  store: AgentStore;
  config?: () => AgentConfig;
  investigate?: typeof runAgentInvestigation;
  evidenceReader?: typeof createAgentEvidenceReader;
}

function errorResponse(error: unknown): Response {
  if (error instanceof AgentHttpError || error instanceof AgentStoreError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  // Do not expose SQL, provider errors, prompts, headers, or credentials.
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
    if ("code" in cause && (cause.code === "42P01" || cause.code === "42703")) return Response.json({ error: "Agent storage is not ready. Apply the agent conversations migration before enabling it." }, { status: 503, headers: privateHeaders });
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return Response.json({ error: "Agent is temporarily unavailable. Please try again." }, { status: 503, headers: privateHeaders });
}

/** Same-org membership is checked before accessing any private thread or running tools. */
export function createAgentHandlers(dependencies: AgentHandlersDependencies) {
  const configuration = dependencies.config ?? readAgentConfig;
  const investigate = dependencies.investigate ?? runAgentInvestigation;
  const evidenceReader = dependencies.evidenceReader ?? createAgentEvidenceReader;

  async function list(request: Request, orgSlug: string) {
    try {
      const scope = await dependencies.authorize(request, orgSlug);
      if (scope instanceof Response) return scope;
      const config = configuration();
      const threads = await dependencies.store.listThreads(scope);
      return Response.json({ threads, configured: config.configured, model: config.configured ? config.model : null }, { headers: privateHeaders });
    } catch (error) { return errorResponse(error); }
  }

  async function chat(request: Request, orgSlug: string) {
    try {
      const scope = await dependencies.authorize(request, orgSlug);
      if (scope instanceof Response) return scope;
      const input = await readAgentRequest(request);
      const config = configuration();
      if (!config.configured) throw new AgentHttpError(503, AGENT_UNCONFIGURED);
      request.signal.throwIfAborted();
      const saved = await dependencies.store.beginRun({ ...scope, threadId: input.threadId,
        clientMessageId: input.clientMessageId, assistantId: input.assistantId,
        text: redactAgentPrompt(input.message), sourceRequestId: input.sourceRequestId,
        budget: { maxTokens: config.maxTotalTokens, maxSteps: config.maxSteps } });
      if (saved.kind === "existing" && saved.run.status === "running") throw new AgentHttpError(409, "This investigation is already running. Open chat history to check its progress.");

      const abort = new AbortController();
      const signal = AbortSignal.any([request.signal, abort.signal]);
      let disconnected = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          function send(event: AgentStreamEvent) {
            if (disconnected) return;
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); }
            catch { disconnected = true; abort.abort(); }
          }
          const timeout = setTimeout(() => abort.abort(new Error("Investigation deadline exceeded.")), config.timeoutMs);
          const heartbeat = setInterval(() => {
            if (!disconnected) {
              try { controller.enqueue(encoder.encode(": heartbeat\n\n")); }
              catch { disconnected = true; abort.abort(); }
            }
          }, 15_000);
          send({ type: "run", runId: saved.run.id });
          const execute = async () => {
            if (saved.kind === "existing") {
              for (const step of saved.assistantMessage.steps) send({ type: "step", step });
              send({ type: "evidence", evidence: saved.assistantMessage.evidence });
              if (saved.assistantMessage.text) send({ type: "text", delta: saved.assistantMessage.text });
              send({ type: "finish", status: saved.run.status as "complete" | "failed" | "cancelled", ...(saved.assistantMessage.error ? { error: saved.assistantMessage.error } : {}) });
              return;
            }
            let text = "";
            let steps: AgentStep[] = [];
            let evidence: AgentEvidenceReference[] = [];
            let inputTokens = 0;
            let outputTokens = 0;
            let checkpoint = Promise.resolve();
            let storageFailed = false;
            const snapshot = () => ({ ...scope, runId: saved.run.id, text, steps: [...steps], evidence: [...evidence], inputTokens, outputTokens });
            const persist = () => {
              const data = snapshot();
              checkpoint = checkpoint.then(async () => { await dependencies.store.updateRun(data); }).catch(() => { storageFailed = true; abort.abort(); });
            };
            try {
              const result = await investigate({ config,
                reader: evidenceReader({ organizationId: scope.organizationId, orgSlug, signal,
                  ...(saved.thread.sourceRequestId ? { requestId: saved.thread.sourceRequestId } : {}) }),
                history: saved.thread.messages.filter((message) => message.id !== saved.assistantMessage.id),
                sourceRequestId: saved.thread.sourceRequestId,
                signal,
                onUsage(usage) { inputTokens = usage.inputTokens; outputTokens = usage.outputTokens; persist(); },
                emit(event) {
                  if (event.type === "step") {
                    steps = [...steps.filter((item) => item.id !== event.step.id), event.step];
                    // Updating a step retains its original position even with parallel results.
                    const existingIndex = dataStepIndex.get(event.step.id);
                    if (existingIndex === undefined) dataStepIndex.set(event.step.id, dataStepIndex.size);
                    steps.sort((left, right) => dataStepIndex.get(left.id)! - dataStepIndex.get(right.id)!);
                    persist();
                  } else if (event.type === "evidence") {
                    const references = new Map(evidence.map((item) => [item.id, item]));
                    for (const item of event.evidence) references.set(item.id, item);
                    evidence = [...references.values()].slice(0, 100);
                    persist();
                    send({ type: "evidence", evidence });
                    return;
                  } else if (event.type === "text") text += event.delta;
                  send(event);
                },
              });
              await checkpoint;
              if (storageFailed) throw new Error("Storage failed.");
              signal.throwIfAborted();
              await dependencies.store.finishRun({ ...snapshot(), status: "complete", text: result.text,
                inputTokens: result.inputTokens, outputTokens: result.outputTokens });
              send({ type: "finish", status: "complete" });
            } catch {
              await checkpoint;
              const cancelled = !storageFailed && (request.signal.aborted || disconnected);
              const status = cancelled ? "cancelled" as const : "failed" as const;
              const error = storageFailed ? "The investigation could not be saved. Please try again."
                : cancelled ? "Investigation stopped."
                  : signal.aborted ? "The investigation timed out. Try a narrower question."
                    : "Grok could not complete this investigation. Please try again.";
              steps = steps.map((step) => step.status === "running" ? { ...step, status: "failed" as const, detail: error } : step);
              try { await dependencies.store.finishRun({ ...snapshot(), status, error }); }
              catch { /* History will mark the abandoned run interrupted after its lease expires. */ }
              for (const step of steps) send({ type: "step", step });
              send({ type: "finish", status, error });
            }
          };
          const dataStepIndex = new Map<string, number>();
          void execute().catch(() => send({ type: "finish", status: "failed", error: "The investigation could not be completed." })).finally(() => {
            clearTimeout(timeout); clearInterval(heartbeat);
            if (!disconnected) { try { controller.close(); } catch { /* Disconnected browser. */ } }
          });
        },
        cancel() { disconnected = true; abort.abort(); },
      });
      return new Response(stream, { headers: { ...privateHeaders, "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" } });
    } catch (error) { return errorResponse(error); }
  }
  return { list, chat };
}
