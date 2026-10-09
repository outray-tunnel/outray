import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentMessageResponse } from "../src/components/agent/agent-message-response";
import { AgentComposer, AgentMessageView } from "../src/components/agent/agent-chat-panel";
import type { AgentMessage } from "../src/components/agent/agent-chat-data";
import type { AgentEvidenceReference } from "../src/lib/agent/protocol";

Object.assign(globalThis, { React });
const render = (text: string, streaming = false, orgSlug = "acme") => renderToStaticMarkup(React.createElement(AgentMessageResponse, { text, streaming, orgSlug }));
const message: AgentMessage = { id: "answer", role: "assistant", status: "complete", text: "An observed **fact**.", steps: [], evidence: [] };
const renderMessage = (overrides: Partial<AgentMessage> = {}) => renderToStaticMarkup(React.createElement(AgentMessageView, { message: { ...message, ...overrides }, orgSlug: "acme" }));
const presentedEvidence: AgentEvidenceReference = { id: "request:abc:def", label: "Request details", href: "/acme/observability/requests?search=abc&range=30d", observedAt: "2026-10-08T13:00:00.000Z", presentation: {
  kind: "request", method: "GET", route: "/api/orders", service: "orders-api", statusCode: 503, durationMs: 783, timestamp: null, captureState: "metadata", requestSizeBytes: null, responseSizeBytes: null,
} };
const responseEvidence: AgentEvidenceReference[] = [presentedEvidence, { id: "trace:legacy", label: "Legacy trace", href: "/acme/observability/traces?search=trace", observedAt: "2026-10-08T13:00:00.000Z" }];
const responseSteps: AgentMessage["steps"] = [{ id: "read", label: "Read request metadata", status: "complete" }];

function assertEvidenceHidden(html: string) {
  assert.doesNotMatch(html, /aria-label="Evidence details"|aria-label="Observed evidence"|Request details|Legacy trace/);
  assert.doesNotMatch(html, /href="\/acme\/observability\/(?:requests|traces)/);
}

test("settled Markdown has semantic headings, emphasis, lists, quotes and inline code", () => {
  const html = render("## Findings\n\nA **confirmed fact**, an *inference*, and ~~old guidance~~.\n\n- Route: `/api/orders`\n- No captured payload.\n\n1. Compare requests.\n2. Inspect the trace.\n\n> Only the observed evidence is confirmed.");
  assert.match(html, /<h3[^>]*>Findings<\/h3>/);
  assert.match(html, /<strong[^>]*>confirmed fact<\/strong>/);
  assert.match(html, /<em[^>]*>inference<\/em>/);
  assert.match(html, /<del[^>]*>old guidance<\/del>/);
  assert.match(html, /<ul[^>]*>[\s\S]*<li/);
  assert.match(html, /<ol[^>]*>[\s\S]*<li/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<code[^>]*>\/api\/orders<\/code>/);
  assert.doesNotMatch(html, /\*\*confirmed fact\*\*|~~old guidance~~|`\/api\/orders`/);
  assert.match(html, /data-streaming="false"/);
});

test("fenced code remains escaped and code/table overflow containers are keyboard reachable", () => {
  const html = render("```html\n<script>example()</script>\n```\n\n| Signal | Observed |\n| --- | --- |\n| HTTP | **503** |\n| Duration | 783 ms |");
  assert.match(html, /<pre[^>]*tabindex="0"[^>]*aria-label="Code example"/);
  assert.match(html, /&lt;script&gt;example\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|CodeBlockCopyButton|Download|Copy code/);
  assert.match(html, /class="tableScroll" tabindex="0" role="region" aria-label="Agent result table"/);
  assert.match(html, /<table>[\s\S]*<thead>[\s\S]*<tbody>/);
  assert.match(html, /<strong[^>]*>503<\/strong>/);
});

test("only same-workspace telemetry links become navigable and unsafe destinations stay inert", () => {
  const html = render([
    "[Request](/acme/observability/requests?search=abc&range=30d)",
    "[Trace](/acme/observability/traces?search=trace)",
    "[Logs](/acme/observability/logs?search=trace)",
    "[External](https://evil.example/path)",
    "[Other workspace](/other/observability/requests?search=abc)",
    "[Settings](/acme/settings)",
    "[Scheme](javascript:alert%281%29)",
    "[Data](data:text/html,evil)",
    "[Protocol relative](//evil.example/path)",
  ].join("\n\n"));
  assert.match(html, /href="\/acme\/observability\/requests\?search=abc&amp;range=30d"/);
  assert.match(html, /href="\/acme\/observability\/traces\?search=trace"/);
  assert.match(html, /href="\/acme\/observability\/logs\?search=trace"/);
  assert.equal((html.match(/<a\b/g) ?? []).length, 3);
  assert.match(html, /<span class="inertLink">External<\/span>/);
  assert.match(html, /<span class="inertLink">Other workspace<\/span>/);
  assert.doesNotMatch(html, /href="(?:https?:|javascript:|data:|\/\/|\/other|\/acme\/settings)/);
  assert.doesNotMatch(html, /target=|onclick=|onerror=/i);
});

test("an absent workspace never enables internal links", () => {
  const html = render("[Request](/acme/observability/requests?search=abc)", false, "");
  assert.doesNotMatch(html, /<a\b|href=/);
  assert.match(html, />Request<\/span>/);
});

test("raw HTML, media and Markdown images cannot create embedded content or resource requests", () => {
  const html = render([
    "Visible text.",
    '<script>window.secret()</script>',
    '<a href="/acme/observability/requests" onclick="evil()">Raw HTML link</a>',
    '<img src="https://evil.example/tracker" onerror="evil()">',
    '<iframe src="https://evil.example/embed"></iframe>',
    '<video src="https://evil.example/video"></video>',
    '<audio src="https://evil.example/audio"></audio>',
    '<svg><script>evil()</script></svg>',
    "![Markdown tracker](https://evil.example/pixel.png)",
    "![Local image](/acme/observability/requests?search=abc)",
  ].join("\n\n"));
  assert.match(html, /Visible text/);
  assert.doesNotMatch(html, /<(?:script|img|iframe|video|audio|svg|object|embed|link)\b/i);
  assert.doesNotMatch(html, /(?:src|srcset|onclick|onerror|href)=/i);
  assert.doesNotMatch(html, /window\.secret|evil\.example|Markdown tracker|Local image/);
});

test("streaming mode repairs incomplete emphasis and fenced code without showing delimiter noise", () => {
  const emphasis = render("A **confirmed", true);
  assert.match(emphasis, /data-streaming="true"/);
  assert.match(emphasis, /<strong[^>]*>confirmed<\/strong>/);
  assert.doesNotMatch(emphasis, /\*\*confirmed/);
  const code = render("```json\n{\"status\": 503", true);
  assert.match(code, /<pre[^>]*aria-label="Code example"/);
  assert.match(code, /\{&quot;status&quot;: 503|\{"status": 503/);
  assert.doesNotMatch(code, /```json/);
});

test("incomplete links remain inert while streaming and completed internal links work", () => {
  const partial = render("Open [the request](/acme/observability/requ", true);
  assert.match(partial, /the request/);
  assert.doesNotMatch(partial, /<a\b|href=/);
  const complete = render("Open [the request](/acme/observability/requests?search=abc)", true);
  assert.match(complete, /href="\/acme\/observability\/requests\?search=abc"/);
});

test("local and saved server runs keep the visible working label while only local text streams", () => {
  for (const localStreaming of [true, false]) {
    const html = renderMessage({ status: "running", localStreaming });
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /data-agent-status="working"/);
    assert.match(html, /class="workingIcon"/);
    assert.match(html, /class="workingLabel">Agent working…<\/span>/);
    assert.match(html, new RegExp(`data-streaming="${localStreaming}"`));
    assert.doesNotMatch(html, /Copy response/);
    if (!localStreaming) {
      assert.match(html, /saved response has not finished yet/);
      assert.doesNotMatch(html, /Connecting|animate-pulse|Stop response/);
    }
  }
});

test("terminal replies stop shimmer, preserve copy/failure controls and user text remains plain", () => {
  for (const status of ["complete", "failed", "cancelled"] as const) {
    const html = renderMessage({ status, error: status === "complete" ? undefined : "A safe error." });
    assert.match(html, /aria-busy="false"/);
    assert.match(html, /data-agent-status="idle"/);
    assert.doesNotMatch(html, /workingIcon|workingLabel|Agent working/);
    assert.match(html, /aria-label="Copy response"/);
    if (status !== "complete") assert.match(html, /role="alert"[^>]*>A safe error\./);
  }
  const user = renderMessage({ role: "user", text: "**literal**\n<script>example()</script>" });
  assert.match(user, /\*\*literal\*\*/);
  assert.match(user, /&lt;script&gt;example\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(user, /data-agent-message-response|<strong|<script/);
});

test("evidence received before the answer stays hidden while real preparation remains visible", () => {
  const html = renderMessage({ status: "running", localStreaming: true, text: "", steps: [{ ...responseSteps[0], status: "running" }], evidence: responseEvidence });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Read request metadata/);
  assert.match(html, /aria-label="Investigation steps"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /data-agent-message-response|<details/);
  assertEvidenceHidden(html);
});

test("partial local answers stream Markdown without revealing evidence cards or legacy chips", () => {
  const html = renderMessage({ status: "running", localStreaming: true, text: "An observed **partial fact", steps: [{ ...responseSteps[0], status: "running" }], evidence: responseEvidence });
  assert.match(html, /data-streaming="true"/);
  assert.match(html, /<strong[^>]*>partial fact<\/strong>/);
  assert.match(html, /Read request metadata/);
  assert.doesNotMatch(html, /\*\*partial fact|Copy response/);
  assertEvidenceHidden(html);
});

test("restored running replies keep evidence hidden before and during their saved partial answer", () => {
  for (const text of ["", "An observed **partial fact**."]) {
    const html = renderMessage({ status: "running", localStreaming: false, text, steps: responseSteps, evidence: responseEvidence });
    assert.match(html, /Agent working…/);
    assert.match(html, /saved response has not finished yet/);
    assert.doesNotMatch(html, /Connecting|animate-pulse|Copy response/);
    if (text) {
      assert.match(html, /data-streaming="false"/);
      assert.match(html, /<strong[^>]*>partial fact<\/strong>/);
    }
    assertEvidenceHidden(html);
  }
});

test("completed replies put Markdown before collapsed investigation steps, cards and safe legacy chips", () => {
  const html = renderMessage({ steps: responseSteps, evidence: responseEvidence });
  assert.match(html, /<strong[^>]*>fact<\/strong>/);
  assert.match(html, /<details[^>]*><summary/);
  assert.match(html, /1 investigation step/);
  assert.match(html, /aria-label="Evidence details"/);
  assert.match(html, /aria-label="Observed evidence"/);
  assert.doesNotMatch(html, /<details[^>]*open=|animate-pulse/);
  assert.ok(html.indexOf("data-agent-message-response") < html.indexOf("<details"));
  assert.ok(html.indexOf("<details") < html.indexOf('aria-label="Evidence details"'));
  assert.ok(html.indexOf('aria-label="Evidence details"') < html.indexOf('aria-label="Observed evidence"'));
  assert.equal((html.match(/href="\/acme\/observability\/requests\?search=abc&amp;range=30d"/g) ?? []).length, 1);
  assert.match(html, /Legacy trace/);
});

test("blank and whitespace-only answers never reveal evidence in running or terminal states", () => {
  for (const status of ["running", "complete", "failed", "cancelled"] as const) {
    for (const text of ["", " \n\t "]) {
      for (const localStreaming of status === "running" ? [true, false] : [false]) {
        const html = renderMessage({ status, localStreaming, text, evidence: responseEvidence, error: "A safe error." });
        assertEvidenceHidden(html);
        if (status === "failed" || status === "cancelled") assert.match(html, /role="alert"[^>]*>A safe error\./);
      }
    }
  }
});

test("failed and cancelled replies retain partial answers before evidence and preserve their alerts", () => {
  for (const status of ["failed", "cancelled"] as const) {
    const html = renderMessage({ status, text: "An observed **partial fact**.", steps: responseSteps, evidence: responseEvidence });
    assert.match(html, /<strong[^>]*>partial fact<\/strong>/);
    assert.match(html, /data-streaming="false"/);
    assert.match(html, /aria-label="Evidence details"/);
    assert.match(html, /aria-label="Observed evidence"/);
    assert.ok(html.indexOf("data-agent-message-response") < html.indexOf('aria-label="Evidence details"'));
    assert.ok(html.indexOf('aria-label="Evidence details"') < html.indexOf('aria-label="Observed evidence"'));
    assert.match(html, status === "cancelled" ? /role="alert"[^>]*>Response stopped\./ : /role="alert"[^>]*>This response could not be completed\./);
    assert.match(html, /aria-label="Copy response"/);
  }
});

test("remote runs disable Send without rendering a fake Stop, while local runs retain real Stop", () => {
  const props = { value: "Next question", onChange() {}, onSend() {}, onStop() {} };
  const remote = renderToStaticMarkup(React.createElement(AgentComposer, { ...props, awaitingServer: true }));
  assert.match(remote, /<button[^>]*disabled=""[^>]*aria-label="Send message"/);
  assert.match(remote, /Refresh chats to check the saved response/);
  assert.doesNotMatch(remote, /Stop response/);
  const local = renderToStaticMarkup(React.createElement(AgentComposer, { ...props, preparing: true }));
  assert.match(local, /aria-label="Stop response"/);
  assert.doesNotMatch(local, /aria-label="Send message"/);
});

test("shimmer reduced-motion fallback preserves text and localized Markdown styles bound narrow layouts", async () => {
  const panelCss = await readFile(new URL("../src/components/agent/agent-chat-panel.module.css", import.meta.url), "utf8");
  assert.match(panelCss, /\.workingLabel\s*\{\s*color:/);
  assert.match(panelCss, /animation: working-shimmer/);
  assert.match(panelCss, /animation: working-glow/);
  const reduced = panelCss.slice(panelCss.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /workingLabel, \.workingIcon\s*\{\s*animation: none/);
  assert.match(reduced, /background: none; color: #[\da-f]+; -webkit-text-fill-color: currentColor/);
  assert.doesNotMatch(reduced, /display: none|visibility: hidden|opacity: 0/);
  const markdownCss = await readFile(new URL("../src/components/agent/agent-message-response.module.css", import.meta.url), "utf8");
  assert.match(markdownCss, /\.response\s*\{[\s\S]*?min-width: 0/);
  assert.match(markdownCss, /\.response pre\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow: auto/);
  assert.match(markdownCss, /\.tableScroll\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto/);
  assert.match(markdownCss, /:focus-visible/);
  assert.match(markdownCss, /@media \(max-width: 480px\)/);
});
