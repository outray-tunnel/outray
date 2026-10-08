import assert from "node:assert/strict";
import test from "node:test";
import { agentResponseError, consumeAgentStream, createAgentSseParser, readAgentStreamEvent, readAgentThreadList } from "../src/components/agent/agent-chat-transport";
import type { AgentStreamEvent } from "../src/lib/agent/protocol";

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
test("API errors are plain messages, not HTML, with actionable unavailable fallback", async () => {
  assert.equal(await agentResponseError(Response.json({ error: "Apply the Agent migration" }, { status: 503 })), "Apply the Agent migration");
  assert.match(await agentResponseError(new Response("<html>oops</html>", { status: 503 })), /server configuration and database migration/);
  assert.match(await agentResponseError(new Response("", { status: 401 })), /Sign in/);
});
