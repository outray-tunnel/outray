import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentPreparation } from "../src/components/agent/agent-preparation";
import type { AgentStep } from "../src/lib/agent/protocol";
Object.assign(globalThis, { React });
const steps: AgentStep[] = [{ id: "read", label: "Read requests", status: "complete" }, { id: "logs", label: "Find correlated logs", status: "running" }];
const html = (props: Parameters<typeof AgentPreparation>[0]) => renderToStaticMarkup(React.createElement(AgentPreparation, props));

test("progress displays real dynamic step names and current accessible status", () => {
  const output = html({ steps });
  assert.match(output, /Read requests/);
  assert.match(output, /Find correlated logs/);
  assert.match(output, /aria-live="polite"/);
  assert.match(output, /motion-reduce:animate-none/);
  assert.doesNotMatch(output, /Scripted|preview|Prepare explanation|<details/);
});
test("completed steps use a keyboard-accessible native collapsed disclosure", () => {
  const output = html({ steps: steps.map((step) => ({ ...step, status: "complete" })), complete: true });
  assert.match(output, /<details[^>]*><summary/);
  assert.match(output, /2 investigation steps/);
  assert.match(output, /focus-visible:outline-2/);
  assert.doesNotMatch(output, /<details[^>]*open=|animate-pulse|role="status"/);
});
test("no fake steps are invented while connecting and errors remain visible", () => {
  assert.match(html({ steps: [] }), /Connecting to Agent/);
  assert.equal(html({ steps: [], complete: true }), "");
  const output = html({ steps: [{ id: "failed", label: "Read logs", status: "failed", detail: "Data unavailable" }], complete: true });
  assert.match(output, /Data unavailable/);
  assert.match(output, /1 investigation step/);
});
test("progress is presentation only with safe escaped text", async () => {
  const output = html({ steps: [{ id: "safe", label: "<script>alert(1)</script>", status: "running" }] });
  assert.match(output, /&lt;script&gt;/);
  assert.doesNotMatch(output, /<script/);
  const source = await readFile(new URL("../src/components/agent/agent-preparation.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setTimeout|setInterval|fetch\(|useEffect|dangerouslySetInnerHTML/);
});
