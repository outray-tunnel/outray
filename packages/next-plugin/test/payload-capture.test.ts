import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, test } from "node:test";
import {
  ROOT_CONTEXT,
  context,
  trace,
  type Context,
  type ContextManager,
  type Span,
} from "@opentelemetry/api";
import { OUTRAY_HTTP_CAPTURE_ATTRIBUTES as attributes } from "@outray/core";
import { withOutrayPayloadCapture } from "../src/index";

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

const manager = new AsyncContextManager();

before(() => {
  context.setGlobalContextManager(manager.enable());
});

after(() => {
  context.disable();
});

test("route wrapper preserves objects and captures before resolving", async () => {
  const span = new AttributeSpan();
  const request = new Request("https://example.test/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku: "book", password: "private" }),
  });
  const response = Response.json({ ok: true, token: "private" });
  let handlerRequest: Request | undefined;

  const wrapped = withOutrayPayloadCapture(async (received) => {
    handlerRequest = received;
    await received.json();
    return response;
  });

  const returned = await context.with(
    trace.setSpan(context.active(), span as unknown as Span),
    () => wrapped(request),
  );

  assert.equal(handlerRequest, request);
  assert.equal(returned, response);
  assert.deepEqual(
    JSON.parse(span.attributes.get(attributes.requestBody) as string),
    {
      sku: "book",
      password: "[REDACTED]",
    },
  );
  assert.deepEqual(
    JSON.parse(span.attributes.get(attributes.responseBody) as string),
    {
      ok: true,
      token: "[REDACTED]",
    },
  );
});

test("route wrapper is a direct no-clone path without an active span", async () => {
  const request = new Request("https://example.test/orders");
  request.clone = () => {
    throw new Error("clone should not be called");
  };
  const response = Response.json({ ok: true });
  const wrapped = withOutrayPayloadCapture(async (received) => {
    assert.equal(received, request);
    return response;
  });

  assert.equal(await wrapped(request), response);
});

test("route wrapper preserves handler failures", async () => {
  const span = new AttributeSpan();
  const failure = new Error("handler failed");
  const wrapped = withOutrayPayloadCapture(async () => {
    throw failure;
  });

  await assert.rejects(
    context.with(trace.setSpan(context.active(), span as unknown as Span), () =>
      wrapped(new Request("https://example.test/orders")),
    ),
    (error) => error === failure,
  );
});

test("oversized streaming responses resolve while the original body is untouched", async () => {
  const span = new AttributeSpan();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`{"value":"${"x".repeat(128)}"}`),
        );
        // Deliberately stay open to reproduce tee cancellation waiting.
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
  const wrapped = withOutrayPayloadCapture(async () => response, {
    maxBodyBytes: 16,
  });
  const resultPromise = context.with(
    trace.setSpan(context.active(), span as unknown as Span),
    () => wrapped(new Request("https://example.test/stream")),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    resultPromise.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 250);
    }),
  ]);
  if (timer) clearTimeout(timer);

  await response.body?.cancel();
  assert.equal(await resultPromise, response);
  assert.equal(completed, true);
  assert.equal(span.attributes.get(attributes.responseBodyTruncated), true);
});
