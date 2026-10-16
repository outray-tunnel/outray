import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { after, before, test } from "node:test";
import {
  ROOT_CONTEXT,
  context,
  trace,
  type Context,
  type ContextManager,
  type Span,
} from "@opentelemetry/api";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import {
  OUTRAY_HTTP_CAPTURE_ATTRIBUTES as attributes,
  captureFetchRequest,
  captureFetchResponse,
  createNodeHttpPayloadCaptureMiddleware,
  type HttpPayloadCaptureSetting,
  type NodeHttpPayloadCaptureContext,
} from "../src/http-payload-capture";
import { resolveHttpPayloadCapture, type HttpPayloadCapturePolicy } from "../src/http-payload-capture-policy";

class AsyncContextManager implements ContextManager {
  private readonly storage = new AsyncLocalStorage<Context>();

  active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    activeContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(activeContext, () => fn.call(thisArg, ...args));
  }

  bind<T>(activeContext: Context, target: T): T {
    if (typeof target !== "function") return target;
    const fn = target as (...args: unknown[]) => unknown;
    return ((...args: unknown[]) =>
      this.with(activeContext, fn, undefined, ...args)) as T;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    this.storage.disable();
    return this;
  }
}

class AttributeSpan {
  readonly attributes = new Map<string, string | number | boolean>();

  isRecording(): boolean {
    return true;
  }

  setAttribute(name: string, value: string | number | boolean): this {
    this.attributes.set(name, value);
    return this;
  }
}

class FakeResponse extends EventEmitter {
  readonly chunks: Buffer[] = [];
  readonly headers: Record<string, string | string[]> = {};

  write(chunk: string | Buffer, encoding?: BufferEncoding): boolean {
    this.chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
    );
    return true;
  }

  end(chunk?: string | Buffer, encoding?: BufferEncoding): this {
    if (chunk !== undefined) this.write(chunk, encoding);
    this.emit("finish");
    return this;
  }

  getHeaders(): Record<string, string | string[]> {
    return { ...this.headers };
  }

  getHeader(name: string): string | string[] | undefined {
    return this.headers[name.toLowerCase()];
  }
}

const manager = new AsyncContextManager();

before(() => {
  context.setGlobalContextManager(manager.enable());
});

after(() => {
  context.disable();
});

function withSpan<T>(span: AttributeSpan, callback: () => T): T {
  return context.with(
    trace.setSpan(context.active(), span as unknown as Span),
    callback,
  );
}

test("the shared payload policy is opt-in, preserves approved settings, and never mutates adapter context", () => {
  const request = Object.freeze({ url: "/api/orders", body: "application-owned" });
  const requestContext = Object.freeze({ request, pathname: "/api/orders", adapter: "example" as const });
  const setting = Object.freeze({ maxBodyBytes: 512, redactedFields: Object.freeze(["privateField"]) });
  let calls = 0;
  const policy: HttpPayloadCapturePolicy<typeof requestContext> = { shouldCapturePayloads(value) {
    calls++;
    assert.equal(value, requestContext);
    assert.equal(value.request, request);
    assert.equal(value.adapter, "example", "generic adapter context is retained without framework coupling");
    return true;
  } };
  assert.equal(resolveHttpPayloadCapture(undefined, requestContext, policy), false);
  assert.equal(resolveHttpPayloadCapture(false, requestContext, policy), false);
  assert.equal(calls, 0, "a policy cannot enable statically disabled capture");
  assert.equal(resolveHttpPayloadCapture(true, requestContext), true);
  assert.equal(resolveHttpPayloadCapture(setting, requestContext, {}), setting);
  assert.equal(resolveHttpPayloadCapture(setting, requestContext, policy), setting);
  assert.equal(resolveHttpPayloadCapture(true, requestContext, policy), true);
  assert.equal(calls, 2, "the predicate runs once for each enabled request");
  assert.deepEqual(setting, { maxBodyBytes: 512, redactedFields: ["privateField"] });
  assert.equal(request.body, "application-owned");
});

test("the shared policy fails closed on every non-true result and a throwing or invalid predicate", () => {
  const requestContext = { pathname: "/private" };
  const setting = { maxHeaderBytes: 256 };
  for (const result of [false, undefined, null, 0, 1, "true", {}, [], Promise.resolve(true)]) {
    let calls = 0;
    const policy = { shouldCapturePayloads() { calls++; return result; } } as HttpPayloadCapturePolicy<typeof requestContext>;
    assert.equal(resolveHttpPayloadCapture(setting, requestContext, policy), false);
    assert.equal(calls, 1, "only literal true authorizes a request, and the predicate is not retried");
  }
  let calls = 0;
  assert.equal(resolveHttpPayloadCapture(setting, requestContext, { shouldCapturePayloads() {
    calls++; throw new Error("private-policy-detail");
  } }), false);
  assert.equal(calls, 1);
  assert.equal(resolveHttpPayloadCapture(setting, requestContext,
    { shouldCapturePayloads: "not-a-function" } as unknown as HttpPayloadCapturePolicy<typeof requestContext>), false);
  let reads = 0;
  const throwingPolicy = Object.defineProperty({}, "shouldCapturePayloads", { get() {
    reads++; throw new Error("private-policy-getter-detail");
  } }) as HttpPayloadCapturePolicy<typeof requestContext>;
  assert.equal(resolveHttpPayloadCapture(false, requestContext, throwingPolicy), false);
  assert.equal(reads, 0, "disabled capture does not access an invalid policy");
  assert.equal(resolveHttpPayloadCapture(setting, requestContext, throwingPolicy), false);
  assert.equal(reads, 1);
});

test("the shared capture gate is available from core's public entry point", async () => {
  const core = await import("../src/index");
  assert.equal(core.resolveHttpPayloadCapture, resolveHttpPayloadCapture);
});

test("accidental asynchronous and thenable policies fail closed without waiting or leaking rejected promises", async () => {
  const rejected: unknown[] = [];
  const onRejected = (error: unknown) => { rejected.push(error); };
  process.on("unhandledRejection", onRejected);
  try {
    for (const predicate of [
      async () => true,
      async () => { throw new Error("private-async-policy-error"); },
      () => new Promise<boolean>(() => {}),
      () => ({ then(_resolve: unknown, reject: (error: Error) => void) { reject(new Error("private-thenable-policy-error")); } }),
    ]) {
      let calls = 0;
      const policy = { shouldCapturePayloads() { calls++; return predicate(); } } as unknown as HttpPayloadCapturePolicy<{ pathname: string }>;
      assert.equal(resolveHttpPayloadCapture(true, { pathname: "/private" }, policy), false, "async misuse never authorizes content capture");
      assert.equal(calls, 1);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(rejected, [], "unsupported async policies cannot create unhandled rejections");
  } finally { process.off("unhandledRejection", onRejected); }
});

test("a denied Node policy runs before headers, body reads and response patching, keeping metadata and application errors intact", () => {
  for (const outcome of ["denied", "throws", "invalid", "disabled", "invalid-context", "context-getter", "policy-getter"] as const) {
    const span = new AttributeSpan().setAttribute("http.route", "/api/:org/secrets/reveal").setAttribute("http.response.status_code", 200);
    const request = { method: "POST", url: "/reveal?token=private-query", originalUrl: outcome === "invalid-context" ? "http://[" : "/api/acme/secrets/reveal?token=private-query" };
    let headerReads = 0, bodyReads = 0, predicateCalls = 0, nextCalls = 0;
    let capturedContext: NodeHttpPayloadCaptureContext | undefined;
    Object.defineProperties(request, {
      headers: { get() { headerReads++; return { authorization: "private-header" }; } },
      body: { get() { bodyReads++; return { value: "private-body" }; } },
    });
    if (outcome === "context-getter") Object.defineProperty(request, "originalUrl", { get() { throw new Error("private-context-getter-error"); } });
    const response = new FakeResponse();
    const originalWrite = response.write, originalEnd = response.end;
    const originalSymbols = Object.getOwnPropertySymbols(response);
    const policy = outcome === "policy-getter"
      ? Object.defineProperty({}, "shouldCapturePayloads", { get() { throw new Error("private-policy-getter-error"); } }) as HttpPayloadCapturePolicy<NodeHttpPayloadCaptureContext>
      : outcome === "invalid"
      ? { shouldCapturePayloads: "invalid" } as unknown as HttpPayloadCapturePolicy<NodeHttpPayloadCaptureContext>
      : { shouldCapturePayloads(value: NodeHttpPayloadCaptureContext) {
        predicateCalls++;
        capturedContext = value;
        if (outcome === "throws") throw new Error("private-policy-error");
        return ["disabled", "invalid-context", "context-getter"].includes(outcome);
      } };
    const middleware = createNodeHttpPayloadCaptureMiddleware(outcome !== "disabled", policy);
    const applicationError = new Error("private-application-error");
    withSpan(span, () => assert.throws(() => middleware(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => {
      nextCalls++;
      assert.equal(response.write, originalWrite);
      assert.equal(response.end, originalEnd);
      throw applicationError;
    }), (error) => error === applicationError));
    assert.equal(nextCalls, 1);
    assert.equal(predicateCalls, ["invalid", "disabled", "invalid-context", "context-getter", "policy-getter"].includes(outcome) ? 0 : 1);
    if (capturedContext) {
      assert.equal(capturedContext.request, request);
      assert.equal(capturedContext.response, response);
      assert.equal(capturedContext.pathname, "/api/acme/secrets/reveal", "mounted Express paths cannot hide the original sensitive route");
      assert.equal(capturedContext.method, "POST");
    }
    assert.equal(headerReads, 0);
    assert.equal(bodyReads, 0);
    assert.deepEqual(Object.getOwnPropertySymbols(response), originalSymbols, "denial does not mark the response as captured");
    assert.deepEqual(Object.fromEntries(span.attributes), { "http.route": "/api/:org/secrets/reveal", "http.response.status_code": 200 });
  }
});

test("enabled Node capture with no predicate does not inspect URL or method getters", () => {
  for (const policy of [undefined, {}, { shouldCapturePayloads: undefined }]) {
    const span = new AttributeSpan();
    const request = { headers: { "content-type": "application/json" }, body: { value: "public-request" } };
    let metadataReads = 0;
    for (const property of ["originalUrl", "url", "method"]) Object.defineProperty(request, property, { get() {
      metadataReads++; throw new Error("this field was unnecessary for the original capture API");
    } });
    const response = new FakeResponse();
    response.headers["content-type"] = "application/json";
    let calls = 0;
    withSpan(span, () => createNodeHttpPayloadCaptureMiddleware(true, policy)(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => {
      calls++;
      response.end(JSON.stringify({ value: "public-response", token: "private-response-token" }));
    }));
    assert.equal(calls, 1);
    assert.equal(metadataReads, 0, "an empty optional policy preserves the original capture path");
    assert.equal(span.attributes.get(attributes.version), "1");
    assert.deepEqual(JSON.parse(span.attributes.get(attributes.requestBody) as string), { value: "public-request" });
    assert.deepEqual(JSON.parse(span.attributes.get(attributes.responseBody) as string), { value: "public-response", token: "[REDACTED]" });
  }
});

test("Node policies retain raw mounted and absolute-form paths without normalizing away a sensitive prefix", () => {
  for (const pathname of [
    "/api/acme/secrets/../health", "/api/acme/secrets/%2e%2e/health", "//api/acme/secrets/reveal",
    "/api/acme/secrets/reveal",
  ]) for (const origin of ["", "https://console.example.test"]) {
    const span = new AttributeSpan().setAttribute("http.route", "/api/:org/secrets/:operation");
    const request = { method: "GET", originalUrl: `${origin}${pathname}?token=private-query#private-fragment`, url: "/health" };
    let headerReads = 0, calls = 0;
    Object.defineProperty(request, "headers", { get() { headerReads++; return { authorization: "private-header" }; } });
    const response = new FakeResponse();
    const originalWrite = response.write, originalEnd = response.end;
    let capturedPath: string | undefined;
    withSpan(span, () => createNodeHttpPayloadCaptureMiddleware(true, { shouldCapturePayloads(value) {
      capturedPath = value.pathname;
      return !value.pathname.includes("/secrets/");
    } })(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => { calls++; }));
    assert.equal(capturedPath, pathname, "routing paths must preserve traversal text and leading double slashes");
    assert.equal(calls, 1);
    assert.equal(headerReads, 0);
    assert.equal(response.write, originalWrite);
    assert.equal(response.end, originalEnd);
    assert.deepEqual(Object.fromEntries(span.attributes), { "http.route": "/api/:org/secrets/:operation" });
  }
});

test("one Node middleware safely captures concurrent native public responses while leaving private streams untouched", { timeout: 5000 }, async () => {
  const setting: HttpPayloadCaptureSetting = Object.freeze({
    maxBodyBytes: 1024, redactedHeaders: Object.freeze(["x-private-header"]), redactedFields: Object.freeze(["opaque"]),
  });
  const seen: Array<{ pathname: string; method: string; request: IncomingMessage; response: ServerResponse }> = [];
  const middleware = createNodeHttpPayloadCaptureMiddleware(setting, { shouldCapturePayloads(value) {
    seen.push(value);
    return !value.pathname.includes("/secrets/");
  } });
  const records = new Map<string, AttributeSpan>();
  const failures: unknown[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const server = createServer((request, response) => {
    const privateRequest = request.url!.startsWith("/mounted");
    const key = privateRequest ? "private" : "public";
    const span = new AttributeSpan().setAttribute("http.route", privateRequest ? "/api/:org/secrets/reveal" : "/api/orders");
    records.set(key, span);
    if (privateRequest) {
      Object.assign(request, { originalUrl: "/api/acme/secrets/reveal?token=private-query", url: "/reveal?token=private-query" });
    }
    const originalWrite = response.write, originalEnd = response.end;
    const listenersBefore = request.listenerCount("data");
    withSpan(span, () => middleware(request, response, async () => {
      try {
        assert.equal(request.listenerCount("data"), listenersBefore, "capture never consumes the incoming stream");
        if (privateRequest) {
          assert.equal(response.write, originalWrite);
          assert.equal(response.end, originalEnd);
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(body.value, privateRequest ? "private-request-value" : "public-request-value");
        Object.assign(request, { body });
        if (privateRequest) await barrier;
        else release();
        response.statusCode = privateRequest ? 503 : 201;
        span.setAttribute("http.response.status_code", response.statusCode);
        response.setHeader("content-type", "application/json");
        response.setHeader("x-private-header", "private-response-header");
        response.write('{"value":');
        const result = response.end(`${JSON.stringify(privateRequest ? "private-response-value" : "public-response-value")},"token":"private-response-token"}`);
        assert.equal(result, response, "native response.end retains its receiver and return value");
      } catch (error) {
        failures.push(error); release(); response.statusCode = 500; response.end("test handler failed");
      }
    }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const results = await Promise.all(["/mounted/reveal", "/api/orders?search=public"].map(async (path) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer private-request-token", "x-private-header": "private-request-header" },
        body: JSON.stringify({ value: path.startsWith("/mounted") ? "private-request-value" : "public-request-value", password: "private-password", opaque: "private-opaque-value" }),
        signal: AbortSignal.timeout(3000),
      });
      return { status: response.status, body: await response.json() };
    }));
    assert.deepEqual(failures, []);
    assert.deepEqual(results, [
      { status: 503, body: { value: "private-response-value", token: "private-response-token" } },
      { status: 201, body: { value: "public-response-value", token: "private-response-token" } },
    ], "capture does not alter either application's wire response");
    assert.deepEqual(seen.map(({ pathname }) => pathname).sort(), ["/api/acme/secrets/reveal", "/api/orders"]);
    assert.equal(seen.length, 2, "the shared predicate is evaluated once per native request");
    assert.ok(seen.every(({ method, request, response }) => method === "POST" && request.method === method && request instanceof IncomingMessage && response instanceof ServerResponse));
    const privateSpan = records.get("private")!;
    assert.deepEqual(Object.fromEntries(privateSpan.attributes), { "http.route": "/api/:org/secrets/reveal", "http.response.status_code": 503 });
    const publicSpan = records.get("public")!;
    assert.deepEqual(JSON.parse(publicSpan.attributes.get(attributes.requestBody) as string), {
      value: "public-request-value", password: "[REDACTED]", opaque: "[REDACTED]",
    });
    assert.deepEqual(JSON.parse(publicSpan.attributes.get(attributes.responseBody) as string), { value: "public-response-value", token: "[REDACTED]" });
    assert.equal(JSON.parse(publicSpan.attributes.get(attributes.requestHeaders) as string).authorization, "[REDACTED]");
    assert.equal(JSON.parse(publicSpan.attributes.get(attributes.requestHeaders) as string)["x-private-header"], "[REDACTED]");
    assert.equal(JSON.parse(publicSpan.attributes.get(attributes.responseHeaders) as string)["x-private-header"], "[REDACTED]");
    assert.doesNotMatch(JSON.stringify([...records].map(([key, span]) => ({ key: key === "private" ? "denied" : key, attributes: Object.fromEntries(span.attributes) }))), /private-(?:query|request-|response-|password|opaque-)/);
  } finally {
    release(); server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("node middleware redacts JSON bodies and sensitive headers", () => {
  const span = new AttributeSpan();
  const request = {
    headers: {
      authorization: "Bearer private",
      "content-type": "application/json",
      "content-length": "82",
      "user-agent": "capture-test",
    },
    body: {
      email: "person@example.com",
      password: "not-for-telemetry",
      nested: { refresh_token: "also-private" },
    },
  } as unknown as IncomingMessage & { body?: unknown };
  const response = new FakeResponse();
  response.headers["content-type"] = "application/json; charset=utf-8";
  response.headers["set-cookie"] = ["session=private"];

  let nextCalled = false;
  withSpan(span, () => {
    createNodeHttpPayloadCaptureMiddleware(true)(
      request,
      response as unknown as ServerResponse,
      () => {
        nextCalled = true;
      },
    );
    (response as unknown as ServerResponse).end(
      JSON.stringify({ ok: true, apiKey: "response-private" }),
    );
  });

  assert.equal(nextCalled, true);
  assert.equal(span.attributes.get(attributes.version), "1");
  assert.equal(span.attributes.get(attributes.requestBodySize), 82);
  assert.equal(span.attributes.get(attributes.requestBodyTruncated), false);

  const requestHeaders = JSON.parse(
    span.attributes.get(attributes.requestHeaders) as string,
  );
  assert.equal(requestHeaders.authorization, "[REDACTED]");
  assert.equal(requestHeaders["user-agent"], "capture-test");

  const requestBody = JSON.parse(
    span.attributes.get(attributes.requestBody) as string,
  );
  assert.equal(requestBody.email, "person@example.com");
  assert.equal(requestBody.password, "[REDACTED]");
  assert.equal(requestBody.nested.refresh_token, "[REDACTED]");

  const responseHeaders = JSON.parse(
    span.attributes.get(attributes.responseHeaders) as string,
  );
  assert.equal(responseHeaders["set-cookie"], "[REDACTED]");
  assert.deepEqual(
    JSON.parse(span.attributes.get(attributes.responseBody) as string),
    {
      ok: true,
      apiKey: "[REDACTED]",
    },
  );
});

test("node middleware does not consume streams or patch responses without a span", () => {
  const response = new FakeResponse();
  const originalWrite = response.write;
  const originalEnd = response.end;
  let nextCalled = false;

  createNodeHttpPayloadCaptureMiddleware(true)(
    {
      headers: { "content-type": "application/json" },
    } as unknown as IncomingMessage,
    response as unknown as ServerResponse,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.equal(response.write, originalWrite);
  assert.equal(response.end, originalEnd);
});

test("unsupported and oversized raw bodies are never emitted", () => {
  const span = new AttributeSpan();
  const request = {
    headers: { "content-type": "text/plain" },
    body: "password=private",
  } as unknown as IncomingMessage & { body?: unknown };
  const response = new FakeResponse();
  response.headers["content-type"] = "application/json";

  withSpan(span, () => {
    createNodeHttpPayloadCaptureMiddleware({ maxBodyBytes: 24 })(
      request,
      response as unknown as ServerResponse,
      () => undefined,
    );
    (response as unknown as ServerResponse).end(
      JSON.stringify({ password: "private", value: "x".repeat(100) }),
    );
  });

  assert.equal(span.attributes.has(attributes.requestBody), false);
  assert.equal(span.attributes.has(attributes.responseBody), false);
  assert.equal(span.attributes.get(attributes.responseBodyTruncated), true);
  assert.equal(
    typeof span.attributes.get(attributes.responseBodySize),
    "number",
  );
});

test("parsed JSON truncation stays valid and compressed bodies are skipped", () => {
  const span = new AttributeSpan();
  const request = {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
    },
    body: { password: "private" },
  } as unknown as IncomingMessage & { body?: unknown };
  const response = new FakeResponse();
  response.headers["content-type"] = "application/json";
  response.headers["content-encoding"] = "gzip";

  withSpan(span, () => {
    createNodeHttpPayloadCaptureMiddleware({ maxBodyBytes: 48 })(
      request,
      response as unknown as ServerResponse,
      () => undefined,
    );
    (response as unknown as ServerResponse).end(
      JSON.stringify({ password: "private" }),
    );
  });

  assert.equal(span.attributes.has(attributes.requestBody), false);
  assert.equal(span.attributes.has(attributes.responseBody), false);

  const parsedSpan = new AttributeSpan();
  const parsedRequest = {
    headers: { "content-type": "application/json" },
    body: { password: "private", message: "🙂".repeat(100) },
  } as unknown as IncomingMessage & { body?: unknown };
  const parsedResponse = new FakeResponse();

  withSpan(parsedSpan, () => {
    createNodeHttpPayloadCaptureMiddleware({
      maxBodyBytes: 48,
      responseBody: false,
    })(
      parsedRequest,
      parsedResponse as unknown as ServerResponse,
      () => undefined,
    );
    (parsedResponse as unknown as ServerResponse).end();
  });

  const captured = parsedSpan.attributes.get(attributes.requestBody) as string;
  assert.doesNotThrow(() => JSON.parse(captured));
  assert.ok(Buffer.byteLength(captured) <= 48);
  assert.equal(
    parsedSpan.attributes.get(attributes.requestBodyTruncated),
    true,
  );
  assert.equal(JSON.parse(captured).password, "[REDACTED]");
});

test("Fetch capture preserves literal redaction markers for form fields", async () => {
  const span = new AttributeSpan();

  await withSpan(span, async () => {
    await captureFetchRequest(
      new Request("https://example.test/session", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: "session=private",
        },
        body: "email=person%40example.com&password=private",
      }),
      true,
    );
    await captureFetchResponse(
      new Response(JSON.stringify({ token: "private", ok: true }), {
        headers: { "content-type": "application/vnd.api+json" },
      }),
      true,
    );
  });

  assert.equal(
    span.attributes.get(attributes.requestBody),
    "email=person%40example.com&password=[REDACTED]",
  );
  assert.deepEqual(
    JSON.parse(span.attributes.get(attributes.responseBody) as string),
    {
      token: "[REDACTED]",
      ok: true,
    },
  );
});

test("OAuth bodies redact exchange credentials without hiding normal error codes and states", async () => {
  const span = new AttributeSpan();
  const body = {
    exchange: { grant_type: "authorization_code", code: "private-oauth-code", state: "private-oauth-state", redirect_uri: "https://console.example/callback", codeVerifier: "private-pkce", codeChallenge: "private-challenge", nonce: "private-nonce" },
    callback: { code: "private-callback-code", state: "private-callback-state" },
    oauthCode: "private-explicit-code", verificationCode: "private-otp", credentials: { username: "private-user", password: "private-pass" },
    error: { code: "INVALID_CREDENTIALS", message: "The provider rejected this callback." },
    monitor: { code: 503, state: "down" },
  };
  const original = JSON.stringify(body);
  await withSpan(span, () => captureFetchResponse(new Response(original, { headers: { "content-type": "application/json" } }), true));
  const captured = span.attributes.get(attributes.responseBody) as string;
  assert.doesNotMatch(captured, /private-/);
  const parsed = JSON.parse(captured);
  assert.equal(parsed.exchange.code, "[REDACTED]");
  assert.equal(parsed.exchange.state, "[REDACTED]");
  assert.equal(parsed.exchange.grant_type, "authorization_code");
  assert.equal(parsed.exchange.redirect_uri, "https://console.example/callback");
  assert.deepEqual(parsed.error, body.error);
  assert.deepEqual(parsed.monitor, body.monitor);
  assert.equal(JSON.stringify(body), original, "application payloads are never mutated");
});

test("auth redirect headers retain useful error reasons but redact relative, absolute and nested OAuth URLs", async () => {
  const span = new AttributeSpan();
  const nested = encodeURIComponent("https://app.example/callback?code=private-nested-code&state=private-nested-state&error=access_denied");
  await withSpan(span, () => captureFetchResponse(new Response(null, {
    status: 302,
    headers: {
      location: `/api/auth/callback?code=private-code&state=private-state&error=access_denied&error_description=Provider%20rejected%20callback&redirect=${nested}`,
      "x-auth-help": "https://provider.example/callback?%63ode=private-encoded-code&nonce=private-nonce&error=invalid_grant",
      "x-correlation-id": "callback-123",
    },
  }), true));
  const captured = span.attributes.get(attributes.responseHeaders) as string;
  assert.doesNotMatch(captured, /private-/);
  const headers = JSON.parse(captured);
  const location = new URL(headers.location, "https://app.example");
  assert.equal(location.searchParams.get("code"), "[REDACTED]");
  assert.equal(location.searchParams.get("state"), "[REDACTED]");
  assert.equal(location.searchParams.get("error"), "access_denied");
  assert.equal(location.searchParams.get("error_description"), "Provider rejected callback");
  const callback = new URL(location.searchParams.get("redirect")!);
  assert.equal(callback.searchParams.get("code"), "[REDACTED]");
  assert.equal(callback.searchParams.get("error"), "access_denied");
  assert.equal(headers["x-correlation-id"], "callback-123");
});

test("safe-name JSON values and inline diagnostics scrub credentials but preserve failures", async () => {
  const span = new AttributeSpan();
  await withSpan(span, () => captureFetchResponse(new Response(JSON.stringify({
    message: 'Provider failed code=INVALID_CREDENTIALS password="private-pass with spaces" access_token=private-access retryable=false',
    cause: "connect failed for postgres://private-db-user:private-db-pass@db.example:5432/app?sslmode=require",
    auth: "Bearer private-bearer; Basic cHJpdmF0ZTpwYXNz; outray_private_key; eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.c2lnbmF0dXJl",
    detail: "https://share.example/view#private-fragment",
    callback: "https://app.example/api/auth/callback?code=private-code&state=private-state&error=invalid_grant",
    pem: "-----BEGIN RSA PRIVATE KEY-----\nprivate-pem\n-----END RSA PRIVATE KEY-----",
    cookieMessage: "Cookie: first=private-cookie; second=private-cookie-two",
    stack: "Error: invalid_grant\n at callback (/app/auth.ts:42:5)",
  }), { headers: { "content-type": "application/json" } }), true));
  const captured = span.attributes.get(attributes.responseBody) as string;
  assert.doesNotMatch(captured, /private-|cHJpdmF0ZT|eyJhbGci/);
  const body = JSON.parse(captured);
  assert.match(body.message, /code=INVALID_CREDENTIALS/);
  assert.match(body.message, /retryable=false/);
  assert.match(body.cause, /db\.example:5432\/app\?sslmode=require/);
  assert.match(body.stack, /invalid_grant\n at callback \(\/app\/auth\.ts:42:5\)/);
});

test("OAuth forms and URL-valued custom fields share credential protection", async () => {
  const span = new AttributeSpan();
  const form = new URLSearchParams({ code: "private-form-code", state: "private-form-state", code_verifier: "private-form-pkce", callback: "/callback?code=private-url-code&error=access_denied", privateField: "private-custom-value", message: "code=INVALID_CREDENTIALS" });
  await withSpan(span, () => captureFetchRequest(new Request("https://app.example/oauth", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form }), { redactedFields: ["privateField"] }));
  const captured = span.attributes.get(attributes.requestBody) as string;
  assert.doesNotMatch(captured, /private-/);
  const body = new URLSearchParams(captured);
  assert.equal(body.get("code"), "[REDACTED]");
  assert.equal(body.get("state"), "[REDACTED]");
  assert.equal(body.get("privateField"), "[REDACTED]");
  assert.equal(body.get("message"), "code=INVALID_CREDENTIALS");
  assert.match(body.get("callback")!, /error=access_denied/);
});

test("encoded and deeply nested redirects fail closed at the bounded parsing depth", async () => {
  const span = new AttributeSpan();
  let redirect = "https://app.example/callback?code=private-deep-code&state=private-deep-state";
  for (let index = 0; index < 6; index++) redirect = `https://provider.example/authorize?redirect=${encodeURIComponent(redirect)}`;
  await withSpan(span, () => captureFetchResponse(new Response(JSON.stringify({
    redirect,
    callback: encodeURIComponent("/api/auth/callback?code=private-encoded-code&state=private-encoded-state&error=invalid_grant"),
  }), { headers: { "content-type": "application/json" } }), true));
  const captured = span.attributes.get(attributes.responseBody) as string;
  assert.doesNotMatch(captured, /private-/);
  assert.match(decodeURIComponent(JSON.parse(captured).callback), /error=invalid_grant/);
});

test("Node HTTP capture applies the same protection to inline errors and redirect headers", () => {
  const span = new AttributeSpan();
  const request = { headers: { "content-type": "application/json" }, body: { codeVerifier: "private-node-pkce", message: "Bearer private-node-request" } };
  const response = new FakeResponse();
  response.headers["content-type"] = "application/json";
  response.headers.location = "/callback?code=private-node-code&state=private-node-state&error=invalid_grant";
  withSpan(span, () => createNodeHttpPayloadCaptureMiddleware(true)(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => response.end(JSON.stringify({ code: "INVALID_CREDENTIALS", message: "client_secret=private-node-response" }))));
  assert.doesNotMatch(JSON.stringify(Object.fromEntries(span.attributes)), /private-node/);
  assert.equal(JSON.parse(span.attributes.get(attributes.responseBody) as string).code, "INVALID_CREDENTIALS");
  assert.match(JSON.parse(span.attributes.get(attributes.responseHeaders) as string).location, /error=invalid_grant/);
});

test("request-only field redaction applies to Node and Fetch JSON/forms without masking response diagnostics", async () => {
  const requestBody = {
    code: "a".repeat(64), state: "pending", nonce: "request-nonce", challenge: "request-challenge",
    password: "request-password", shared: "shared-request", message: "code=INVALID_CREDENTIALS",
  };
  const responseBody = {
    code: "INVALID_CREDENTIALS", state: "failed", nonce: "response-nonce", challenge: "response-challenge",
    password: "response-password", shared: "shared-response", message: "The credential is not valid.",
  };
  const originalRequest = JSON.stringify(requestBody);
  const cases: Array<{ setting: HttpPayloadCaptureSetting; requestFields: string[]; responseFields: string[] }> = [
    { setting: true, requestFields: ["password"], responseFields: ["password"] },
    {
      setting: { redactedFields: ["shared"], redactedRequestFields: ["code", "state", "nonce", "challenge"] },
      requestFields: ["password", "shared", "code", "state", "nonce", "challenge"], responseFields: ["password", "shared"],
    },
    {
      setting: { redactedFields: ["code"], redactedRequestFields: ["state"] },
      requestFields: ["password", "code", "state"], responseFields: ["password", "code"],
    },
  ];
  for (const adapter of ["Node", "Fetch"]) {
    for (const contentType of ["application/json", "application/x-www-form-urlencoded"]) {
      const serialize = (body: Record<string, string>) => contentType === "application/json" ? JSON.stringify(body) : new URLSearchParams(body).toString();
      const parse = (raw: string): Record<string, string> => contentType === "application/json" ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
      for (const { setting, requestFields, responseFields } of cases) {
        const span = new AttributeSpan();
        await withSpan(span, async () => {
          if (adapter === "Fetch") {
            await captureFetchRequest(new Request("https://app.example/api/cli/complete", { method: "POST", headers: { "content-type": contentType }, body: serialize(requestBody) }), setting);
            await captureFetchResponse(new Response(serialize(responseBody), { headers: { "content-type": contentType } }), setting);
          } else {
            const response = new FakeResponse();
            response.headers["content-type"] = contentType;
            const request = { headers: { "content-type": contentType }, body: { ...requestBody } };
            createNodeHttpPayloadCaptureMiddleware(setting)(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => response.end(serialize(responseBody)));
          }
        });
        const capturedRequest = parse(span.attributes.get(attributes.requestBody) as string);
        const capturedResponse = parse(span.attributes.get(attributes.responseBody) as string);
        for (const [field, value] of Object.entries(requestBody)) {
          assert.equal(capturedRequest[field], requestFields.includes(field) ? "[REDACTED]" : field === "message" && requestFields.includes("code") ? "code=[REDACTED]" : value, `${adapter} ${contentType} request ${field}`);
        }
        for (const [field, value] of Object.entries(responseBody)) {
          assert.equal(capturedResponse[field], responseFields.includes(field) ? "[REDACTED]" : value, `${adapter} ${contentType} response ${field}`);
        }
      }
    }
  }
  assert.equal(JSON.stringify(requestBody), originalRequest);
});

test("request-only redaction protects lone CLI completion and OTP codes", async () => {
  for (const code of ["a".repeat(64), "123456"]) {
    const span = new AttributeSpan();
    await withSpan(span, () => captureFetchRequest(new Request("https://app.example/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }), { redactedRequestFields: ["code"] }));
    assert.deepEqual(JSON.parse(span.attributes.get(attributes.requestBody) as string), { code: "[REDACTED]" });
    assert.doesNotMatch(span.attributes.get(attributes.requestBody) as string, new RegExp(code));
  }
});

test("oversized cloned Fetch responses do not wait for the original branch", async () => {
  const span = new AttributeSpan();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`{"value":"${"x".repeat(128)}"}`),
        );
        // Deliberately stay open: clone cancellation must not wait for this branch.
      },
    }),
    { headers: { "content-type": "application/json" } },
  );

  const capture = withSpan(span, () =>
    captureFetchResponse(response.clone(), { maxBodyBytes: 16 }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    capture.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 250);
    }),
  ]);
  if (timer) clearTimeout(timer);

  await response.body?.cancel();
  assert.equal(completed, true);
  assert.equal(span.attributes.get(attributes.responseBodyTruncated), true);
});
