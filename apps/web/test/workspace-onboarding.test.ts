import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import instancePolicy from "../../../shared/instance-config";
import { InstanceContext, type PublicInstanceConfig } from "../src/lib/instance-context";

type Environment = Record<string, string | undefined>;

async function publicInstance(env: Environment): Promise<PublicInstanceConfig> {
  const hostsSource = await readFile(new URL("../../../shared/public-hosts.ts", import.meta.url), "utf8");
  const hostsModule = { exports: {} as { publicOrigin: (value: string, variable: string) => URL } };
  runInNewContext(ts.transpileModule(hostsSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: hostsModule, exports: hostsModule.exports, URL, process: { env: {} } });
  const source = await readFile(new URL("../src/lib/instance.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { getPublicInstanceConfig: () => PublicInstanceConfig } };
  runInNewContext(compiled, {
    module, exports: module.exports, process: { env },
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-start") return { createServerFn: () => ({ handler: (run: () => unknown) => run }) };
      if (specifier.endsWith("shared/instance-config")) return { instanceConfig: () => instancePolicy.instanceConfig(env) };
      if (specifier.endsWith("shared/public-hosts")) return hostsModule.exports;
      throw new Error(`Unexpected public-instance dependency: ${specifier}`);
    },
  });
  return module.exports.getPublicInstanceConfig();
}

async function onboardingComponent(): Promise<React.ComponentType> {
  const source = await readFile(new URL("../src/routes/onboarding.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as { Route: { component: React.ComponentType } } };
  runInNewContext(compiled, {
    module, exports: module.exports, console,
    require: (specifier: string) => {
      if (specifier === "react") return React;
      if (specifier === "react/jsx-runtime") return jsxRuntime;
      if (specifier.startsWith("@outray/icons/")) return [];
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: () => createElement("span", { "aria-hidden": true }) };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (options: unknown) => options,
        useNavigate: () => () => undefined,
        Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => createElement("a", { ...props, href: to }, children),
        Navigate: () => null,
      };
      if (specifier === "@/lib/instance-context") return { useInstance: () => React.useContext(InstanceContext) };
      if (specifier === "@/lib/auth-client") return { authClient: {
        useSession: () => ({ data: { session: { id: "test-session" }, user: { name: "Test owner", email: "owner@example.test" } }, isPending: false }),
      } };
      if (specifier === "@/lib/app-client") return { appClient: { organizations: {} } };
      if (specifier === "@/lib/store") return { useAppStore: (select: (store: unknown) => unknown) => select({ setSelectedOrganization: () => undefined }) };
      throw new Error(`Unexpected onboarding dependency: ${specifier}`);
    },
  });
  return module.exports.Route.component;
}

test("workspace prefix resolves only a validated public console origin with the existing precedence", async () => {
  const cases = [
    [{}, "outray.dev/"],
    [{ APP_URL: "http://localhost:6767" }, "localhost:6767/"],
    [{ OUTRAY_DEPLOYMENT_MODE: "self-hosted", CONSOLE_PUBLIC_URL: "https://OPS.example.net:8443/", APP_URL: "https://ignored.example.net" }, "ops.example.net:8443/"],
    [{ OUTRAY_DEPLOYMENT_MODE: "self-hosted", APP_URL: "https://console.example.net" }, "console.example.net/"],
    [{ OUTRAY_DEPLOYMENT_MODE: "self-hosted", BETTER_AUTH_URL: "https://auth.example.net" }, "auth.example.net/"],
  ] as const;
  for (const [env, prefix] of cases) assert.equal((await publicInstance(env)).workspaceUrlPrefix, prefix);
  await assert.rejects(publicInstance({ OUTRAY_DEPLOYMENT_MODE: "self-hosted" }), /CONSOLE_PUBLIC_URL is required/);
  for (const url of [
    "https://owner:private@ops.example.net", "https://ops.example.net?token=private",
    "https://ops.example.net#private", "https://ops.example.net/nested", "javascript:alert(1)",
  ]) await assert.rejects(publicInstance({ CONSOLE_PUBLIC_URL: url }), /HTTP\(S\) origin without credentials/);
});

test("public instance serialization exposes the prefix and provider availability, never credentials or sign-in allowlists", async () => {
  const result = await publicInstance({
    OUTRAY_DEPLOYMENT_MODE: "self-hosted", CONSOLE_PUBLIC_URL: "https://ops.example.net",
    GITHUB_CLIENT_ID: "client-test", GITHUB_CLIENT_SECRET: "private-provider-secret",
    OUTRAY_SIGNUP_ALLOWED_EMAILS: "private-owner@example.net", DATABASE_URL: "private-database-url",
    OUTRAY_SIGNUP_ALLOWED_DOMAINS: "private-allowed-domain.example.net",
  });
  assert.equal(result.workspaceUrlPrefix, "ops.example.net/");
  assert.equal(result.authProviders.join(","), "github");
  const json = JSON.stringify(result);
  for (const privateValue of ["client-test", "private-provider-secret", "private-owner@example.net", "private-database-url", "private-allowed-domain.example.net"]) assert.equal(json.includes(privateValue), false);
});

test("workspace onboarding uses the server-loaded prefix on its first render without accessing a browser location", async () => {
  const Onboarding = await onboardingComponent();
  for (const [env, prefix] of [
    [{}, "outray.dev/"],
    [{ OUTRAY_DEPLOYMENT_MODE: "self-hosted", CONSOLE_PUBLIC_URL: "https://ops.outray.dev" }, "ops.outray.dev/"],
    [{ OUTRAY_DEPLOYMENT_MODE: "self-hosted", CONSOLE_PUBLIC_URL: "http://localhost:8767" }, "localhost:8767/"],
  ] as const) {
    const config = await publicInstance(env);
    const html = renderToStaticMarkup(createElement(InstanceContext.Provider, { value: config }, createElement(Onboarding)));
    assert.ok(html.includes(`title="${prefix}"`));
    assert.ok(html.includes(`>${prefix}</span>`));
    assert.match(html, /Workspace URL/);
    assert.match(html, /id="slug"/);
  }
});

test("workspace availability feedback distinguishes self-hosted route collisions from hosted reservations and duplicate names", async () => {
  const source = await readFile(new URL("../src/routes/onboarding.tsx", import.meta.url), "utf8");
  assert.match(source, /data\.reason === "reserved"\s*\? "This URL is reserved\. Contact support@outray\.dev to claim it\."/);
  assert.match(source, /data\.reason === "route"\s*\? "This URL is used by the application\. Choose a different workspace URL\."/);
  assert.match(source, /: "This workspace URL is already in use\."/);
});
