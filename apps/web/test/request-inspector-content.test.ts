import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ts from "typescript";
import { CopyButton } from "../src/components/arc/copy-button/copy-button";
import { FullCaptureDisabledContent } from "../src/components/requests/full-capture-disabled-content";
import { JsonViewer, formatBody } from "../src/components/requests/json-viewer";
import {
  BodySection,
  HeaderSection,
  RequestTabContent,
} from "../src/components/requests/request-tab-content";
import { ResponseTabContent } from "../src/components/requests/response-tab-content";
import { SegmentedControl } from "../src/components/ui/segmented-control";
import type {
  RequestDetails,
  TunnelEvent,
} from "../src/components/requests/types";

Object.assign(globalThis, { React });

const request: TunnelEvent = {
  request_id: "request-1",
  timestamp: 1_800_000_000_000,
  tunnel_id: "tunnel-1",
  organization_id: "org-1",
  host: "preview.example.com",
  method: "POST",
  path: "/checkout?tag=a&tag=b",
  status_code: 201,
  request_duration_ms: 42,
  bytes_in: 100,
  bytes_out: 200,
  client_ip: "127.0.0.1",
  user_agent: "test-agent",
};
const details: RequestDetails = {
  headers: {
    "content-type": "application/json",
    "set-cookie": ["first=1", "second=2"],
  },
  queryParams: { tag: "b" },
  queryEntries: [
    ["tag", "a"],
    ["tag", "b"],
  ],
  body: '{"order":42,"confirmed":false}',
  bodySize: 30,
};

function renderRequest(
  overrides: Partial<React.ComponentProps<typeof RequestTabContent>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(RequestTabContent, { request, details, ...overrides }),
  );
}

type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [
    element,
    ...elements(element.props.children),
    ...elements(element.props.action),
  ];
}

test("payload sections use readable headings and left-aligned wrapping definition rows", () => {
  const html = renderRequest();
  assert.match(html, /aria-label="Request payload"/);
  assert.match(html, /Query parameters|Headers|Body/);
  assert.match(html, /<section[^>]+aria-labelledby=/);
  assert.match(html, /<dl[^>]*divide-y/);
  assert.match(html, /<dt[^>]*text-\[12px\][^>]*text-zinc-400/);
  assert.match(html, /<dd[^>]*overflow-wrap:anywhere/);
  assert.match(html, /grid-cols-1[^>]*sm:grid-cols-/);
  assert.doesNotMatch(
    html,
    /text-right|text-zinc-700|text-zinc-800|uppercase|>General</,
  );
});

test("query duplicates and header array values remain individually visible", () => {
  const html = renderRequest();
  assert.equal((html.match(/<dt[^>]*>tag<\/dt>/g) ?? []).length, 2);
  assert.match(html, /<div>a<\/div>/);
  assert.match(html, /<div>b<\/div>/);
  assert.match(html, /<div>first=1<\/div><div>second=2<\/div>/);
  assert.doesNotMatch(html, /first=1, second=2/);
  assert.match(html, /2 parameters/);
  const legacy = renderRequest({
    details: { ...details, queryEntries: undefined },
  });
  assert.equal((legacy.match(/<dt[^>]*>tag<\/dt>/g) ?? []).length, 1);
  assert.match(legacy, /<div>b<\/div>/);
});

test("captured empty payloads differ from unavailable metadata and never offer empty copy actions", () => {
  const emptyDetails = {
    headers: {},
    queryParams: {},
    body: null,
    bodySize: 0,
  };
  const empty = renderRequest({ details: emptyDetails });
  assert.match(empty, /No headers|Empty body/);
  assert.match(empty, /0 B/);
  assert.doesNotMatch(
    empty,
    /unavailable|Copy request headers|Copy request body|Body format/,
  );
  const missing = renderRequest({
    captured: false,
    details: { ...details, body: "uncaptured-secret" },
  });
  assert.match(missing, /Headers unavailable|Body unavailable/);
  assert.doesNotMatch(
    missing,
    /first=1|uncaptured-secret|Copy request headers|Copy request body|Empty body/,
  );
  assert.match(
    missing,
    /Query parameters/,
    "path-based query values remain available as metadata",
  );
});

test("null content with a known nonzero body size is not presented as an empty body", () => {
  const html = renderRequest({
    details: { headers: {}, queryParams: {}, body: null, bodySize: 128 },
  });
  assert.match(html, /Body unavailable/);
  assert.match(html, /128 B/);
  assert.doesNotMatch(html, /Empty body|Copy request body/);
  const noSize = renderRequest({
    details: { headers: {}, queryParams: {}, body: "" },
  });
  assert.match(noSize, /Empty body/);
  assert.doesNotMatch(noSize, /0 B|NaN|undefined/);
});

test("JSON primitives and empty containers remain real bodies with formatting and copy controls", () => {
  for (const body of ["0", "false", "null", "{}", "[]", '""']) {
    const html = renderRequest({
      details: { headers: {}, queryParams: {}, body },
    });
    assert.match(html, /aria-label="Body format"/);
    assert.match(html, /aria-label="Copy request body"/);
    assert.doesNotMatch(html, /Empty body|Body unavailable/);
    const formatted = formatBody(body);
    assert.equal(formatted.isJson, true);
    assert.deepEqual(formatted.parsed, JSON.parse(body));
  }
});

test("raw text, malformed JSON and HTML payloads render safely as text", () => {
  const body = '<script>alert("secret")</script>\n{"broken":';
  const html = renderRequest({
    details: {
      headers: { "<img src=x>": "<b>value</b>" },
      queryParams: {},
      body,
    },
  });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x>|<b>value<\/b>|Body format/);
  assert.match(html, /whitespace-pre-wrap/);
  assert.deepEqual(formatBody(body), {
    isJson: false,
    parsed: null,
    formatted: body,
  });
});

test("request and response reuse copy feedback and preserve the complete stored headers", () => {
  const onCopied = () => {};
  const onCopyError = () => {};
  const tree = HeaderSection({
    headers: details.headers,
    copyLabel: "Copy headers",
    onCopied,
    onCopyError,
  });
  const copy = elements(tree).find((node) => node.type === CopyButton);
  assert.ok(copy);
  assert.equal(copy.props.value, JSON.stringify(details.headers, null, 2));
  assert.equal(copy.props.onCopied, onCopied);
  assert.equal(copy.props.onCopyError, onCopyError);
  assert.equal(copy.props.variant, "plain");
  const response = renderToStaticMarkup(
    React.createElement(ResponseTabContent, { details }),
  );
  assert.match(response, /aria-label="Response payload"/);
  assert.match(response, /Copy response headers|Copy response body/);
  assert.doesNotMatch(response, /Query parameters|Copy request/);
});

test("only an explicit truncation flag shows a stored-portion warning", () => {
  const html = renderRequest({
    details: { ...details, bodySize: 1000, bodyTruncated: true },
  });
  assert.match(html, /truncated during capture/);
  const mismatch = renderRequest({ details: { ...details, bodySize: 1000 } });
  assert.doesNotMatch(mismatch, /truncated|redacted/);
});

test("JSON containers expose labeled keyboard buttons and honor initialExpanded", () => {
  const html = renderToStaticMarkup(
    React.createElement(JsonViewer, { data: { orders: [{ id: 1 }] } }),
  );
  assert.match(
    html,
    /aria-label="Collapse object at root" aria-expanded="true"/,
  );
  assert.match(
    html,
    /aria-label="Collapse array at root.orders" aria-expanded="true"/,
  );
  assert.match(
    html,
    /aria-label="Expand object at root.orders\[0\]" aria-expanded="false"/,
  );
  assert.match(html, /type="button"/);
  assert.match(html, /focus-visible:outline/);
  const collapsed = renderToStaticMarkup(
    React.createElement(JsonViewer, {
      data: { private: "value" },
      initialExpanded: false,
    }),
  );
  assert.match(
    collapsed,
    /aria-label="Expand object at root" aria-expanded="false"/,
  );
  assert.doesNotMatch(collapsed, /private|value/);
  const scalar = renderToStaticMarkup(
    React.createElement(JsonViewer, { data: false }),
  );
  assert.match(scalar, /false/);
  assert.doesNotMatch(scalar, /Expand all|Collapse all/);
});

test("disabled capture is an actionable notice, not fake loaded payloads", () => {
  const html = renderToStaticMarkup(
    React.createElement(QueryClientProvider, {
      client: new QueryClient(),
      children: React.createElement(FullCaptureDisabledContent, {
        orgSlug: "team",
        request,
      }),
    }),
  );
  assert.match(html, /Full capture is off|metadata only|future requests/);
  assert.match(html, /Enable full capture/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.doesNotMatch(
    html,
    /animate-pulse|>Headers<|>Body<|>General<|text-zinc-700|Request settings/,
  );
});

test("capture confirmation uses nested modal focus handling and retains errors instead of closing", async () => {
  const source = await readFile(
    new URL(
      "../src/components/requests/full-capture-disabled-content.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /import \* as Dialog from "@radix-ui\/react-dialog"/);
  assert.match(source, /<Dialog\.Trigger asChild>/);
  assert.match(source, /<Dialog\.Title/);
  assert.match(source, /<Dialog\.Description/);
  assert.match(source, /z-\[70\]|z-\[71\]/);
  assert.match(
    source,
    /enableFullCaptureMutation\.error &&\s*\(?\s*<p\s+role="alert"/,
  );
  assert.match(
    source,
    /onEscapeKeyDown|onPointerDownOutside|onInteractOutside/,
  );
  assert.doesNotMatch(
    source,
    /document\.body|createPortal|onError:.*setShowConfirmation\(false\)/,
  );
});

test("Pretty/Raw switching updates both the body rendering and the copied payload", async () => {
  const source = await readFile(
    new URL(
      "../src/components/requests/request-tab-content.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  let mode = "pretty";
  const module = { exports: {} as { BodySection: typeof BodySection } };
  runInNewContext(compiled, {
    React,
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react")
        return {
          useId: () => "test-section",
          useState: () => [
            mode,
            (next: string) => {
              mode = next;
            },
          ],
        };
      if (specifier === "lucide-react") return { Info: () => null };
      if (specifier.includes("arc/copy-button")) return { CopyButton };
      if (specifier.includes("ui/segmented-control"))
        return { SegmentedControl };
      if (specifier === "./json-viewer") return { JsonViewer, formatBody };
      if (specifier === "./utils")
        return { formatBytes: (value: number) => `${value} B` };
      throw new Error(`Unexpected payload dependency: ${specifier}`);
    },
  });
  const props = { body: '{"item":1}', copyLabel: "Copy body" };
  let tree = module.exports.BodySection(props);
  let nodes = elements(tree);
  assert.equal(
    nodes.find((node) => node.type === CopyButton)?.props.value,
    '{\n  "item": 1\n}',
  );
  assert.ok(nodes.find((node) => node.type === JsonViewer));
  nodes
    .find((node) => node.type === SegmentedControl)!
    .props.onValueChange("raw");
  tree = module.exports.BodySection(props);
  nodes = elements(tree);
  assert.equal(
    nodes.find((node) => node.type === CopyButton)?.props.value,
    props.body,
  );
  assert.equal(
    nodes.find((node) => node.type === "pre")?.props.children,
    props.body,
  );
  assert.equal(
    nodes.find((node) => node.type === JsonViewer),
    undefined,
  );
  nodes
    .find((node) => node.type === SegmentedControl)!
    .props.onValueChange("pretty");
  assert.ok(
    elements(module.exports.BodySection(props)).find(
      (node) => node.type === JsonViewer,
    ),
  );
});
