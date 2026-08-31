import assert from "node:assert/strict";
import { test } from "node:test";
import type { Application } from "express";
import outray from "../src/index";

test("explicit capture registers even when the tunnel is disabled", () => {
  const middleware: unknown[] = [];
  const app = {
    use(value: unknown) {
      middleware.push(value);
      return this;
    },
  } as unknown as Application;

  outray(app, {
    enabled: false,
    capturePayloads: true,
    silent: true,
  });

  assert.equal(middleware.length, 1);
  assert.equal(typeof middleware[0], "function");
});

test("capture is not registered by default", () => {
  const middleware: unknown[] = [];
  const app = {
    use(value: unknown) {
      middleware.push(value);
      return this;
    },
  } as unknown as Application;

  outray(app, { enabled: false, silent: true });

  assert.equal(middleware.length, 0);
});
