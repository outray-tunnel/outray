/** Synthetic loaded-picker SSR benchmark; no browser, network, authentication, or database calls.
 * Run from apps/web: npx tsx --tsconfig tsconfig.app.json --import ./test/register-css-loader.mjs scripts/benchmark-uptime-recipients.ts
 * The baseline is the pre-change component at the supplied Git ref (default pinned pre-change revision).
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as icons from "lucide-react";
import * as fields from "../src/components/ui/workspace-input";
import * as uptimeUi from "../src/components/uptime/uptime-ui";
import * as skeletons from "../src/components/uptime/uptime-skeleton";
import * as recipientData from "../src/components/uptime/email-recipient-data";

Object.assign(globalThis, { React });
const orgSlug = "outray-tunnel";
const members = Array.from({ length: 10_001 }, (_, index) => ({ id: `member-${index}`, name: `Person ${index}`, email: `person${index}@example.com`, role: "member" }));
const firstPage = { members: members.slice(0, recipientData.UPTIME_RECIPIENT_PAGE_SIZE), currentUserId: "owner", nextCursor: "next-cursor" };
const baselineRef = process.argv[2] ?? "a7d31692d507cbd233aed9a3cfa9ae8c7c22f9cb";
const baseline = execFileSync("git", ["show", `${baselineRef}:apps/web/src/components/uptime/email-recipients.tsx`], { encoding: "utf8" });
const updated = await readFile(new URL("../src/components/uptime/email-recipients.tsx", import.meta.url), "utf8");

function renderer(source: string, old: boolean) {
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  let stateIndex = 0;
  const oldState = [{ orgSlug, members }, { orgSlug, loading: false, error: null }];
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, Error, Set, URLSearchParams, module, exports: module.exports,
    require(specifier: string) {
      if (specifier === "react") return {
        memo: (component: unknown) => component, useId: () => "recipients", useRef: (value: unknown) => ({ current: value }), useEffect: () => {},
        useState(value: unknown) { const slot = stateIndex++; return [old ? oldState[slot] : (typeof value === "function" ? value() : value), () => {}]; },
      };
      if (specifier === "@tanstack/react-query") return { useQuery: () => ({ data: firstPage, isPending: false, isFetching: false, error: null, refetch: async () => ({}) }) };
      if (specifier === "./uptime-client") return { uptimeRequest: async () => { throw new Error("Benchmark must not fetch"); } };
      if (specifier === "./email-recipient-data") return recipientData;
      if (specifier === "./uptime-ui") return uptimeUi;
      if (specifier === "./uptime-skeleton") return skeletons;
      if (specifier === "../ui/workspace-input") return fields;
      if (specifier === "lucide-react") return icons;
      throw new Error(`Unexpected benchmark dependency: ${specifier}`);
    },
  });
  return () => {
    stateIndex = 0;
    return renderToStaticMarkup(React.createElement(module.exports.UptimeEmailRecipients, { orgSlug, value: [], onChange: () => {}, disabled: false }));
  };
}

function measure(render: () => string) {
  for (let warmup = 0; warmup < 2; warmup++) render();
  const durations: number[] = [];
  let html = "";
  for (let run = 0; run < 10; run++) { const started = performance.now(); html = render(); durations.push(performance.now() - started); }
  durations.sort((left, right) => left - right);
  return {
    medianMs: Number(((durations[4] + durations[5]) / 2).toFixed(2)),
    rows: (html.match(/type="checkbox"/g) ?? []).length,
    elements: (html.match(/<[a-z][^>]*>/g) ?? []).length,
    htmlBytes: Buffer.byteLength(html),
  };
}

const before = measure(renderer(baseline, true));
const after = measure(renderer(updated, false));
console.log(JSON.stringify({
  method: "Actual loaded recipient components rendered to static HTML; 10 measured runs after 2 warmups, mocked hooks/query, same 10,001-member workspace fixture. Not browser opening/typing latency or network timing.",
  baselineRef, before, after,
  speedup: Number((before.medianMs / after.medianMs).toFixed(1)),
}, null, 2));
