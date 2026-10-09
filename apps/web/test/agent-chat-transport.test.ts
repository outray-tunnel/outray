import assert from "node:assert/strict";
import test from "node:test";
import { agentResponseError, consumeAgentStream, createAgentSseParser, readAgentStreamEvent, readAgentThreadList } from "../src/components/agent/agent-chat-transport";
import type { AgentStreamEvent } from "../src/lib/agent/protocol";

const presentation = {
  kind: "request" as const, method: "GET", route: "/api/orders", service: "checkout-api",
  statusCode: 200, durationMs: 783, timestamp: "2026-10-08T01:00:00.000Z",
  captureState: "redacted" as const, requestSizeBytes: 0, responseSizeBytes: 48,
};
const reference = { id: "request:abc:def", label: "Observed request", href: "/acme/observability/requests?search=id", observedAt: "2026-10-08T13:00:00.000Z", presentation };

function response(chunks: string[]) {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { const encoder = new TextEncoder(); for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
}
test("SSE framing supports arbitrary chunk boundaries, comments, CRLF and multiline data", () => {
  const events: unknown[] = [];
  const parser = createAgentSseParser((event) => events.push(event));
  const source = ': heartbeat\r\n\r\ndata: {"type":"text",\r\ndata: "delta":"Hello"}\r\n\r\ndata: {"type":"finish","status":"complete"}\n\n';
  for (const character of source) parser.push(character);
  parser.finish();
  assert.deepEqual(events, [{ type: "text", delta: "Hello" }, { type: "finish", status: "complete" }]);
});
test("stream decoder preserves split Unicode bytes and signals actual finish", async () => {
  const source = new TextEncoder().encode('data: {"type":"text","delta":"Hi 🦊"}\n\ndata: {"type":"finish","status":"complete"}\n\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of source) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events: AgentStreamEvent[] = [];
  await consumeAgentStream(new Response(stream, { headers: { "content-type": "text/event-stream" } }), "acme", (event) => events.push(event));
  assert.deepEqual(events, [{ type: "text", delta: "Hi 🦊" }, { type: "finish", status: "complete" }]);
});
test("truncated streams, invalid JSON and wrong content type never become fake successes", async () => {
  await assert.rejects(consumeAgentStream(response(['data: {"type":"text","delta":"partial"}\n\n']), "acme", () => undefined), /before the response was complete/);
  await assert.rejects(consumeAgentStream(response(['data: invalid\n\n']), "acme", () => undefined), /invalid response stream/);
  await assert.rejects(consumeAgentStream(response(['data: {"type":"finish","status":"complete"}']), "acme", () => undefined), /before the response was complete/);
  await assert.rejects(consumeAgentStream(new Response("<html>failed</html>"), "acme", () => undefined), /unexpected response/);
});
test("untrusted evidence cannot navigate outside the current workspace", () => {
  const event = readAgentStreamEvent({ type: "evidence", evidence: [
    { id: "request:abc:def", label: "Request", href: "/acme/observability/requests?search=id", observedAt: "2026-10-08" },
    { id: "external", label: "External", href: "https://evil.example", observedAt: "2026-10-08" },
    { id: "other", label: "Other team", href: "/other/observability/logs", observedAt: "2026-10-08" },
  ] }, "acme");
  assert.equal(event.type, "evidence");
  if (event.type === "evidence") assert.deepEqual(event.evidence.map((item) => item.id), ["request:abc:def"]);
  assert.throws(() => readAgentStreamEvent({ type: "html", html: "<script>" }, "acme"));
  assert.throws(() => readAgentStreamEvent({ type: "step", step: { id: "x", label: "oops", status: "invented" } }, "acme"));
});
test("history validates persisted fields while configuration can truthfully remain absent", () => {
  assert.deepEqual(readAgentThreadList({ threads: [], configured: false, model: null }, "acme"), { threads: [], configured: false, model: null });
  assert.throws(() => readAgentThreadList({ threads: [{ id: "bad" }], configured: true, model: "grok" }, "acme"), /history/);
});
test("rich evidence survives SSE framing and saved history without forwarding arbitrary fields", async () => {
  const events: AgentStreamEvent[] = [];
  const event = { type: "evidence", evidence: [{ ...reference, rawTelemetry: "PRIVATE_PAYLOAD" }] };
  const source = `data: ${JSON.stringify(event)}\n\ndata: {"type":"finish","status":"complete"}\n\n`;
  await consumeAgentStream(response([...source]), "acme", (item) => events.push(item));
  assert.deepEqual(events[0], { type: "evidence", evidence: [reference] });
  const history = readAgentThreadList({ configured: true, model: "grok", threads: [{
    id: "thread", title: "Explain this request", sourceRequestId: null, createdAt: 1, updatedAt: 2,
    messages: [{ id: "reply", role: "assistant", text: "### Findings\nSuccessful request.", status: "complete", steps: [], evidence: [reference] }],
  }] }, "acme");
  assert.deepEqual(history.threads[0].messages[0].evidence, [reference]);
  assert.equal(history.threads[0].messages[0].text, "### Findings\nSuccessful request.");
});
test("invalid optional cards fall back to legacy sources while invalid links suppress cards too", () => {
  const { presentation: _presentation, ...legacy } = reference;
  const event = readAgentStreamEvent({ type: "evidence", evidence: [
    { ...reference, presentation: { ...presentation, durationMs: -1 } },
    { ...reference, id: "with-extra", presentation: { ...presentation, body: "PRIVATE_PAYLOAD" } },
    { ...reference, id: "other", href: "/other/observability/requests" },
    { ...reference, id: "external", href: "https://evil.example" },
  ] }, "acme");
  assert.deepEqual(event, { type: "evidence", evidence: [legacy, { ...legacy, id: "with-extra" }] });
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE|durationMs|presentation|evil/);
});
test("API errors are plain messages, not HTML, with actionable unavailable fallback", async () => {
  assert.equal(await agentResponseError(Response.json({ error: "Apply the Agent migration" }, { status: 503 })), "Apply the Agent migration");
  assert.match(await agentResponseError(new Response("<html>oops</html>", { status: 503 })), /server configuration and database migration/);
  assert.match(await agentResponseError(new Response("", { status: 401 })), /Sign in/);
});
