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
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OUTRAY_HTTP_CAPTURE_ATTRIBUTES as attributes,
  captureFetchRequest,
  captureFetchResponse,
  createNodeHttpPayloadCaptureMiddleware,
} from "../src/http-payload-capture";

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
