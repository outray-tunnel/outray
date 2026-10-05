import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import ts from "typescript";
import {
  HttpRequestInspector,
  HttpRequestInspectorContent,
} from "../src/components/observability/http-request-inspector";
import {
  fetchHttpRequestDetails,
  generateHttpRequestCurl,
} from "../src/components/observability/http-request-inspector-data";
import * as requestsData from "../src/components/observability/http-requests-data";
import { normalizeHttpMethod } from "../src/lib/observability/http-method";

Object.assign(globalThis, { React });

const request: requestsData.HttpRequestDetails = {
  id: "telemetry-span-1",
  requestId: "request-1",
  timestamp: "2026-10-05T12:00:00Z",
  method: "POST",
  route: "/api/orders/:id",
  path: "/api/orders/42",
  service: "checkout",
  environment: "production",
  region: "eu-west",
  statusCode: 201,
  duration: 1250,
  traceId: "trace-1",
  spanId: "span-1",
  captureState: "full",
  requestSize: 32,
  responseSize: 128,
  url: "https://example.com/api/orders/42",
  clientAddress: "127.0.0.1",
  userAgent: "test-agent",
  protocol: "HTTP/1.1",
  request: {
    headers: { "content-type": "application/json" },
    headersCaptured: true,
    headersTruncated: false,
    query: { expand: "items" },
    body: '{"item":"book","quantity":2}',
    bodyCaptured: true,
    bodyTruncated: false,
    bodyContentType: "application/json",
    size: 32,
  },
  response: {
    headers: { "content-type": "application/json" },
    headersCaptured: true,
    headersTruncated: false,
    body: '{"order":42}',
    bodyCaptured: true,
    bodyTruncated: false,
    bodyContentType: "application/json",
    size: 128,
  },
  attributes: {},
  resourceAttributes: {},
};

const details: requestsData.RequestDetailsResponse = {
  request,
  logs: [
    {
      id: "log-1",
      timestamp: request.timestamp,
      level: "info",
      message: "Order accepted",
    },
  ],
};

type ContentProps = React.ComponentProps<typeof HttpRequestInspectorContent>;
function renderContent(overrides: Partial<ContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({
      initialEntries: ["/acme/observability/requests"],
    }),
  });
  return renderToStaticMarkup(
    React.createElement(RouterContextProvider, {
      router,
      children: React.createElement(HttpRequestInspectorContent, {
        details,
        tab: "request",
        orgSlug: "acme",
        ...overrides,
      }),
    }),
  );
}

function withPayload(
  payload: Partial<requestsData.HttpRequestDetails["request"]>,
  captureState = request.captureState,
) {
  return {
    ...details,
    request: {
      ...request,
      captureState,
      request: { ...request.request, ...payload },
    },
  };
}

type Element = React.ReactElement<any>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

test("a closed request inspector renders no drawer and never requests details", (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCount++;
    return Response.json(details);
  });
  const html = renderToStaticMarkup(
    React.createElement(HttpRequestInspector, {
      request: null,
      orgSlug: "acme",
      onClose: () => {},
    }),
  );
  assert.equal(html, "");
  assert.equal(fetchCount, 0);
});

test("the inspector delegates modal focus, Escape and return-focus behavior to SideSheet", () => {
  const onClose = () => {};
  const returnFocusRef = { current: null };
  const tree = HttpRequestInspector({
    request,
    orgSlug: "acme",
    onClose,
    returnFocusRef,
  }) as Element;
  assert.equal((tree.type as { name: string }).name, "SideSheet");
  assert.equal(tree.props.open, true);
  assert.equal(tree.props.title, "Request details");
  assert.equal(tree.props.onClose, onClose);
  assert.equal(tree.props.returnFocusRef, returnFocusRef);
  assert.equal(tree.props.children.key, "acme:telemetry-span-1");
  const next = HttpRequestInspector({
    request,
    orgSlug: "other",
    onClose,
  }) as Element;
  assert.equal(
    next.props.children.key,
    "other:telemetry-span-1",
    "organization changes reset all payload state",
  );
});

test("request and response sections server-render only their actual payload", () => {
  const requestHtml = renderContent();
  assert.match(requestHtml, /aria-label="Request details"/);
  assert.match(
    requestHtml,
    /Copy as cURL|Query parameters|Client address|test-agent/,
  );
  assert.match(requestHtml, /book/);
  assert.doesNotMatch(requestHtml, /Response size|Order accepted/);
  const responseHtml = renderContent({ tab: "response" });
  assert.match(responseHtml, /aria-label="Response details"/);
  assert.match(responseHtml, /Response size|1\.25 s|128 B/);
  assert.match(responseHtml, /order/);
  assert.doesNotMatch(
    responseHtml,
    /Copy as cURL|Query parameters|test-agent|book/,
  );
  assert.match(requestHtml, /text-zinc-400/);
  assert.doesNotMatch(
    requestHtml,
    /text-zinc-700|bg-\[#080808\]|uppercase tracking/,
  );
});

test("metadata-only payloads remain different from a captured empty body and headers", () => {
  const metadata = renderContent({
    details: withPayload(
      { headers: {}, headersCaptured: false, body: null, bodyCaptured: false },
      "metadata",
    ),
  });
  assert.match(metadata, /Headers not captured|Header capture was not enabled/);
  assert.match(
    metadata,
    /Body not captured|This request was collected as metadata only/,
  );
  assert.doesNotMatch(
    metadata,
    /Empty body|Captured header set is empty|aria-label="Copy body"|aria-label="Copy headers"/,
  );
  for (const body of [null, ""]) {
    const empty = renderContent({
      details: withPayload({ headers: {}, body }),
    });
    assert.match(
      empty,
      /Captured header set is empty|Empty body|Capture completed and this payload did not contain a body/,
    );
    assert.doesNotMatch(
      empty,
      /not captured|aria-label="Copy body"|aria-label="Copy headers"/,
    );
  }
});

test("capture flags never reveal or copy a payload that was not captured", () => {
  const html = renderContent({
    details: withPayload({
      headers: { authorization: "uncaptured-header-secret" },
      headersCaptured: false,
      body: "uncaptured-body-secret",
      bodyCaptured: false,
    }),
  });
  assert.match(html, /Headers not captured|Body not captured/);
  assert.doesNotMatch(
    html,
    /uncaptured-header-secret|uncaptured-body-secret|aria-label="Copy body"|aria-label="Copy headers"/,
  );
});

test("redaction and truncation warnings survive independently, including an empty truncated capture", () => {
  const html = renderContent({
    details: withPayload(
      {
        headers: { authorization: "[REDACTED]" },
        headersTruncated: true,
        body: '{"token":"%5Bredacted%5D"}',
        bodyTruncated: true,
      },
      "redacted",
    ),
  });
  assert.equal(
    (html.match(/Sensitive values were redacted\./g) ?? []).length,
    2,
  );
  assert.match(html, /The captured headers was truncated\./);
  assert.match(html, /The captured body was truncated\./);
  assert.match(html, /\[REDACTED\]|%5Bredacted%5D/);
  const empty = renderContent({
    details: withPayload({
      headers: {},
      headersTruncated: true,
      body: "",
      bodyTruncated: true,
    }),
  });
  assert.match(empty, /Captured header set is empty|Empty body/);
  assert.match(empty, /The captured headers was truncated\./);
  assert.match(empty, /The captured body was truncated\./);
});

test("context retains organization-scoped telemetry, trace, service and log links", () => {
  const html = renderContent({ tab: "context" });
  assert.match(html, /aria-label="Context details"/);
  assert.match(html, /href="\/acme\/observability\/traces\?search=trace-1"/);
  assert.match(html, /href="\/acme\/observability\/services\/checkout"/);
  assert.match(html, /href="\/acme\/observability\/logs\?search=trace-1"/);
  assert.match(
    html,
    /Copy trace ID|request.id|telemetry\/span ID|environment|region|Order accepted/,
  );
  const unlinked = renderContent({
    tab: "context",
    details: { request: { ...request, traceId: "" }, logs: [] },
  });
  assert.match(unlinked, /No trace ID|No logs linked to this trace/);
  assert.doesNotMatch(unlinked, /Open trace|Open logs|Copy trace ID/);
});

test("untrusted payloads and log messages remain escaped text", () => {
  const payload = '<script>alert("payload")</script>';
  const html = renderContent({
    details: withPayload({
      body: payload,
      query: { "<script>key</script>": payload },
    }),
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const context = renderContent({
    tab: "context",
    details: {
      request,
      logs: [
        {
          id: "log-script",
          level: "error",
          timestamp: request.timestamp,
          message: payload,
        },
      ],
    },
  });
  assert.doesNotMatch(context, /<script>/);
  assert.match(context, /&lt;script&gt;/);
});

test("loading and unavailable states do not masquerade as an empty capture and offer a real retry", () => {
  const loading = renderContent({ loading: true, details: null });
  assert.match(
    loading,
    /aria-busy="true"|aria-label="Loading request details"|motion-reduce:animate-none/,
  );
  assert.doesNotMatch(loading, /Empty body|not captured/);
  let retries = 0;
  const tree = HttpRequestInspectorContent({
    details: null,
    error: "Request details are temporarily unavailable.",
    tab: "request",
    orgSlug: "acme",
    onRetry: () => retries++,
  });
  const retry = elements(tree).find((element) => element.type === "button");
  assert.ok(retry);
  retry.props.onClick();
  assert.equal(retries, 1);
  const unavailable = renderContent({ details: null, onRetry: () => {} });
  assert.match(
    unavailable,
    /role="alert"|Request details are unavailable|Try again/,
  );
});

test("copy-as-cURL shell-escapes URL, headers and body without evaluating shell metacharacters", () => {
  const url = "https://example.com/a'$(printf SHOULD_NOT_EXECUTE);?q=one";
  const header = "one'$(printf SHOULD_NOT_EXECUTE);two";
  const body = "{'value':'$(printf SHOULD_NOT_EXECUTE)'}";
  const command = generateHttpRequestCurl({
    ...request,
    url,
    request: {
      ...request.request,
      headers: { "x-custom": header, authorization: "[REDACTED]" },
      body,
    },
  });
  const output = execFileSync(
    "/bin/sh",
    ["-c", `curl() { printf '%s\\0' "$@"; }\n${command}`],
    { encoding: "utf8" },
  );
  assert.deepEqual(output.split("\0").slice(0, -1), [
    "-X",
    "POST",
    url,
    "-H",
    `x-custom: ${header}`,
    "--data",
    body,
  ]);
  assert.doesNotMatch(command, /authorization/);
});

test("copy-as-cURL normalizes methods and omits unavailable or redacted headers", () => {
  const redacted = generateHttpRequestCurl({
    ...request,
    method: "post",
    request: {
      ...request.request,
      headers: {
        authorization: "[redacted]",
        "x-secret": "%5BRedacted%5D",
        "x-prefix": "masked:[REDACTED]",
      },
    },
  });
  assert.match(redacted, /^curl -X 'POST'/);
  assert.doesNotMatch(redacted, /authorization|x-secret|x-prefix/);
  const uncaptured = generateHttpRequestCurl({
    ...request,
    method: "bogus'; printf INJECTED",
    request: {
      ...request.request,
      headers: { authorization: "hidden" },
      headersCaptured: false,
      body: "hidden",
      bodyCaptured: false,
    },
  });
  assert.match(uncaptured, /^curl -X 'GET'/);
  assert.doesNotMatch(uncaptured, /hidden|--data| -H|INJECTED/);
});

test("detail fetch encodes both organization and telemetry ID and forwards cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(
        url,
        "/api/team%2Fother/observability/requests/span%2Fwith%3Fspecial%23id",
      );
      assert.equal(options.signal, controller.signal);
      return Response.json(details);
    },
  );
  assert.deepEqual(
    await fetchHttpRequestDetails(
      "team/other",
      "span/with?special#id",
      controller.signal,
    ),
    details,
  );
});

test("a failed detail fetch rejects instead of rendering a success-shaped response", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("unavailable", { status: 503 }),
  );
  await assert.rejects(
    fetchHttpRequestDetails("acme", request.id, new AbortController().signal),
    /Could not load request details/,
  );
});

/** Exercise the drawer's hook transitions without introducing a DOM-only test dependency. */
async function loadInteractiveInspector(fetcher: typeof fetch) {
  const source = await readFile(
    new URL(
      "../src/components/observability/http-request-inspector.tsx",
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
  const helperSource = await readFile(
    new URL(
      "../src/components/observability/http-request-inspector-data.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const helperCompiled = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const helperModule = {
    exports:
      {} as typeof import("../src/components/observability/http-request-inspector-data"),
  };
  runInNewContext(helperCompiled, {
    module: helperModule,
    exports: helperModule.exports,
    fetch: fetcher,
    require: (specifier: string) => {
      if (specifier === "@/lib/observability/http-method")
        return { normalizeHttpMethod };
      throw new Error(`Unexpected inspector helper dependency: ${specifier}`);
    },
  });
  const values: any[] = [];
  const effects: Array<{
    callback: () => (() => void) | void;
    dependencies: unknown[];
    cleanup?: (() => void) | void;
  }> = [];
  const pendingEffects: Array<{
    slot: number;
    callback: () => (() => void) | void;
    dependencies: unknown[];
  }> = [];
  let stateIndex = 0;
  let effectIndex = 0;
  const stubs = Object.fromEntries(
    ["CopyButton", "SegmentedControl", "SideSheet", "JsonViewer"].map(
      (name) => [
        name,
        (props: any) =>
          React.createElement(
            "div",
            { "data-component": name },
            props.children,
          ),
      ],
    ),
  );
  const module = {
    exports:
      {} as typeof import("../src/components/observability/http-request-inspector"),
  };
  runInNewContext(compiled, {
    React,
    module,
    exports: module.exports,
    AbortController,
    fetch: fetcher,
    require: (specifier: string) => {
      if (specifier === "react")
        return {
          useState: (initial: any) => {
            const slot = stateIndex++;
            if (!(slot in values))
              values[slot] =
                typeof initial === "function" ? initial() : initial;
            return [
              values[slot],
              (next: any) => {
                values[slot] =
                  typeof next === "function" ? next(values[slot]) : next;
              },
            ];
          },
          useEffect: (
            callback: () => (() => void) | void,
            dependencies: unknown[],
          ) => {
            const slot = effectIndex++;
            if (
              !effects[slot] ||
              dependencies.some(
                (value, index) =>
                  !Object.is(value, effects[slot].dependencies[index]),
              )
            )
              pendingEffects.push({ slot, callback, dependencies });
          },
        };
      if (specifier === "@tanstack/react-router") return { Link: "a" };
      if (specifier === "lucide-react")
        return new Proxy({}, { get: () => () => null });
      if (specifier === "./http-requests-data") return requestsData;
      if (specifier === "./http-request-inspector-data")
        return helperModule.exports;
      if (specifier === "./http-request-badges")
        return {
          HttpRequestStatusBadge: "span",
          HttpRequestCaptureBadge: "span",
        };
      if (specifier === "@/lib/observability/http-method")
        return { normalizeHttpMethod };
      if (specifier === "@/components/requests/utils")
        return { formatBytes: (size: number) => `${size} B` };
      if (specifier === "@/components/requests/json-viewer")
        return {
          ...stubs,
          formatBody: (body: string | null) => ({
            formatted: body,
            parsed: null,
          }),
        };
      if (specifier.startsWith("@/components/")) return stubs;
      throw new Error(`Unexpected inspector dependency: ${specifier}`);
    },
  });
  const outer = module.exports.HttpRequestInspector({
    request,
    orgSlug: "acme",
    onClose: () => {},
  }) as Element;
  const inner = outer.props.children as Element;
  return {
    values,
    stubs,
    module,
    render() {
      stateIndex = 0;
      effectIndex = 0;
      return (inner.type as (props: any) => React.ReactNode)(inner.props);
    },
    commit() {
      for (const effect of pendingEffects.splice(0)) {
        effects[effect.slot]?.cleanup?.();
        effects[effect.slot] = { ...effect, cleanup: effect.callback() };
      }
    },
    cleanup() {
      for (const effect of effects) effect.cleanup?.();
    },
    content(tree: React.ReactNode) {
      return elements(tree).find(
        (element) =>
          element.type === module.exports.HttpRequestInspectorContent,
      )!;
    },
  };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("detail tabs, inline copy failures and retry preserve real drawer state", async () => {
  let fetchCount = 0;
  const view = await loadInteractiveInspector(async () => {
    fetchCount++;
    return fetchCount === 1
      ? new Response("unavailable", { status: 503 })
      : Response.json(details);
  });
  let tree = view.render();
  assert.equal(view.content(tree).props.loading, true);
  view.commit();
  await tick();
  tree = view.render();
  assert.equal(view.content(tree).props.loading, false);
  assert.equal(
    view.content(tree).props.error,
    "Request details are temporarily unavailable.",
  );
  view.content(tree).props.onRetry();
  tree = view.render();
  assert.equal(view.content(tree).props.loading, true);
  assert.equal(view.content(tree).props.error, null);
  view.commit();
  await tick();
  tree = view.render();
  assert.equal(fetchCount, 2);
  assert.equal(view.content(tree).props.details.request.id, request.id);
  const control = elements(tree).find(
    (element) => element.type === view.stubs.SegmentedControl,
  )!;
  assert.deepEqual(
    Array.from(
      control.props.options,
      (option: { value: string }) => option.value,
    ),
    ["request", "response", "context"],
  );
  control.props.onValueChange("response");
  tree = view.render();
  assert.equal(view.content(tree).props.tab, "response");
  view.content(tree).props.onCopyError();
  tree = view.render();
  const alert = elements(tree).find(
    (element) => element.props.role === "alert",
  );
  assert.ok(alert);
  assert.match(alert.props.children, /Could not copy to the clipboard/);
  view.content(tree).props.onCopied();
  tree = view.render();
  assert.equal(
    elements(tree).some((element) => element.props.role === "alert"),
    false,
  );
  view.cleanup();
});

test("closing the drawer aborts an in-flight detail fetch and ignores its late response", async () => {
  let signal: AbortSignal | undefined;
  let resolveFetch!: (response: Response) => void;
  const view = await loadInteractiveInspector(async (_url, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
  });
  view.render();
  view.commit();
  assert.equal(signal?.aborted, false);
  view.cleanup();
  assert.equal(signal?.aborted, true);
  resolveFetch(Response.json(details));
  await tick();
  assert.equal(
    view.values[1],
    null,
    "late details never overwrite closed or changed selection",
  );
  assert.equal(
    view.values[3],
    null,
    "an aborted fetch never surfaces a failure alert",
  );
});

test("closing the drawer also ignores JSON that resolves after the request was aborted", async () => {
  let resolveJson!: (response: requestsData.RequestDetailsResponse) => void;
  const view = await loadInteractiveInspector(
    async () =>
      ({
        ok: true,
        json: () =>
          new Promise((resolve) => {
            resolveJson = resolve;
          }),
      }) as Response,
  );
  view.render();
  view.commit();
  await tick();
  view.cleanup();
  resolveJson(details);
  await tick();
  assert.equal(view.values[1], null);
  assert.equal(view.values[3], null);
});
