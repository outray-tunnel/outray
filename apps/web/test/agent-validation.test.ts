import assert from "node:assert/strict";
import test from "node:test";
import { readAgentConfig } from "../src/lib/agent/config";
import { AgentHttpError, assertAgentOrigin, readAgentRequest, redactAgentPrompt, validateAgentRequest } from "../src/lib/agent/validation";

const input = {
  threadId: "11111111-1111-4111-8111-111111111111",
  clientMessageId: "22222222-2222-4222-8222-222222222222",
  assistantId: "33333333-3333-4333-8333-333333333333",
  message: "Explain this request.",
  sourceRequestId: `${"a".repeat(32)}:${"b".repeat(16)}`,
};
const httpError = (status: number) => (value: unknown) => value instanceof AgentHttpError && value.status === status;
function request(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("https://outray.co/team/agent/chat", {
    method: "POST", body, headers: { "content-type": "application/json", ...headers },
    ...(typeof body !== "string" ? { duplex: "half" } : {}),
  } as RequestInit);
}

test("Agent configuration is server-controlled, opt-out capable and model-configurable", () => {
  assert.equal(readAgentConfig({}).configured, false);
  const configured = readAgentConfig({ XAI_API_KEY: "synthetic-test-key" });
  assert.equal(configured.configured, true);
  assert.equal(configured.model, "grok-4.7");
  assert.equal(configured.timeoutMs, 90_000);
  assert.equal(configured.maxToolCalls, 8);
  assert.equal(readAgentConfig({ XAI_API_KEY: "test", AGENT_ENABLED: "false" }).configured, false);
  assert.equal(readAgentConfig({ XAI_API_KEY: "test", AGENT_GROK_MODEL: "https://evil.example" }).configured, false);
  assert.equal(readAgentConfig({ XAI_API_KEY: "test", AGENT_GROK_MODEL: "grok-next" }).model, "grok-next");
});

test("message schema only accepts identities, prompt and a validated source ID", () => {
  assert.deepEqual(validateAgentRequest({ ...input, message: "  Explain this request.  " }), input);
  assert.equal(validateAgentRequest({ ...input, sourceRequestId: input.sourceRequestId.toUpperCase() }).sourceRequestId, input.sourceRequestId);
  for (const extra of ["organizationId", "userId", "model", "apiKey", "messages", "context", "tools"]) {
    assert.throws(() => validateAgentRequest({ ...input, [extra]: "untrusted" }), httpError(400));
  }
  for (const value of [null, [], "text", { ...input, threadId: "other" }, { ...input, message: " " },
    { ...input, message: "a".repeat(4_001) }, { ...input, assistantId: input.clientMessageId }, { ...input, sourceRequestId: "any-request" }]) {
    assert.throws(() => validateAgentRequest(value), httpError(400));
  }
});

test("cookie-authenticated mutations reject cross-site origins before parsing", () => {
  for (const headers of [{ origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" },
    { origin: "https://outray.co.attacker.example" }, { origin: "null" }]) {
    assert.throws(() => assertAgentOrigin(request(JSON.stringify(input), headers)), httpError(403));
  }
  assert.doesNotThrow(() => assertAgentOrigin(request("{}", { origin: "https://outray.co", "sec-fetch-site": "same-origin" })));
  assert.doesNotThrow(() => assertAgentOrigin(request("{}")));
});

test("request reader enforces content type, UTF-8, JSON and content-length", async () => {
  assert.deepEqual(await readAgentRequest(request(JSON.stringify(input))), input);
  await assert.rejects(readAgentRequest(request(JSON.stringify(input), { "content-type": "text/plain" })), httpError(415));
  await assert.rejects(readAgentRequest(request("<html>")), httpError(400));
  await assert.rejects(readAgentRequest(request("{}", { "content-length": "24577" })), httpError(413));
  await assert.rejects(readAgentRequest(request(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } }))), httpError(400));
});

test("chunked bodies cannot bypass the byte bound and overflowing streams are cancelled", async () => {
  let cancelled = false;
  let count = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { count++; controller.enqueue(new Uint8Array(16_000)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readAgentRequest(request(body)), httpError(413));
  assert.ok(cancelled);
  assert.ok(count <= 3);
});

test("Unicode input within the character bound is decoded intact", async () => {
  const value = { ...input, message: "🔒".repeat(1_000) };
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, 301)); controller.enqueue(bytes.slice(301)); controller.close();
  } });
  assert.equal((await readAgentRequest(request(body))).message, value.message);
});

test("prompt redaction withholds URL credentials, query and fragment values", () => {
  const value = redactAgentPrompt("Check https://username:password@example.com/api?token=secret&x=hidden#key and https://host.test/path");
  assert.equal(value, "Check https://example.com/api and https://host.test/path");
  assert.doesNotMatch(value, /username|password|secret|hidden|#key/);
});

test("prompt redaction covers env assignments, JSON credentials, auth and cookies", () => {
  const cases = [
    'password="very sensitive value"', "API_KEY=super-secret-test", '"password": "quoted-secret-value"',
    '"token":"token-value"', "'secret': 'value with spaces'", '"authorization": "Bearer embedded-token"',
    "Authorization: Basic dXNlcjpwYXNzd29yZA==", "Bearer opaque-value", "Cookie: session=opaque; csrf=hidden",
    "Set-Cookie: session=opaque; HttpOnly; Secure", `xai-${"a".repeat(32)}`, `eyJ${"a".repeat(12)}.abc.def`,
  ];
  for (const value of cases) {
    const redacted = redactAgentPrompt(value);
    assert.match(redacted, /redacted/);
    assert.doesNotMatch(redacted, /very sensitive|super-secret|quoted-secret|token-value|value with spaces|embedded-token|dXNlcj|opaque-value|session=opaque|csrf=hidden/);
  }
  assert.equal(redactAgentPrompt("Explain\u0000\u202erequest"), "Explainrequest");
  assert.equal(redactAgentPrompt("What does a 502 mean?"), "What does a 502 mean?");
});
