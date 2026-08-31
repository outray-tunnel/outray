import assert from "node:assert/strict";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { registerOutrayPayloadCapture } from "../src/index";

function createApp(
  options: {
    adapter?: string;
    initialized?: boolean;
    listening?: boolean;
  } = {},
): { app: INestApplication; middleware: unknown[] } {
  const middleware: unknown[] = [];
  const app = {
    isInitialized: options.initialized ?? false,
    getHttpAdapter: () => ({ getType: () => options.adapter ?? "express" }),
    getHttpServer: () => ({ listening: options.listening ?? false }),
    use(value: unknown) {
      middleware.push(value);
      return this;
    },
  } as unknown as INestApplication;

  return { app, middleware };
}

test("capture is registered once before Nest initializes", () => {
  const { app, middleware } = createApp();

  assert.equal(registerOutrayPayloadCapture(app), true);
  assert.equal(registerOutrayPayloadCapture(app), true);
  assert.equal(middleware.length, 1);
  assert.equal(typeof middleware[0], "function");
});

test("late and non-Express registration are safe no-ops", () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const late = createApp({ listening: true });
    const fastify = createApp({ adapter: "fastify" });

    assert.equal(registerOutrayPayloadCapture(late.app), false);
    assert.equal(registerOutrayPayloadCapture(fastify.app), false);
    assert.equal(late.middleware.length, 0);
    assert.equal(fastify.middleware.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});
