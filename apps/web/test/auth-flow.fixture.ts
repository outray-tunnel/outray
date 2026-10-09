import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";
import { readLoginSearch, type LoginProvider } from "../src/lib/login";
import * as login from "../src/lib/login";

export interface AuthResult {
  error?: { message: string } | null;
  data?: { redirect?: boolean; url?: string } | null;
}

export interface AuthPageProps {
  mode?: "login" | "signup";
  loading: LoginProvider | null;
  sessionPending: boolean;
  error: string | null;
  redirect?: string;
  onLogin: (provider: LoginProvider) => void;
}

type CallbackOptions = ReturnType<typeof login.loginCallbacks>;
export interface AuthControllerOptions {
  search?: Record<string, unknown>;
  session?: { user: { id: string } } | null;
  pending?: boolean;
  social?: (callbacks: CallbackOptions) => Promise<AuthResult>;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Real route handlers with deterministic hooks; no auth server, database or browser. */
export async function authRouteController(mode: "login" | "signup", options: AuthControllerOptions = {}) {
  const source = await readFile(new URL(`../src/routes/${mode}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const values: unknown[] = [];
  const updates: Array<{ slot: number; value: unknown }> = [];
  const effects: Array<() => void | (() => void)> = [];
  const cleanups: Array<() => void> = [];
  const calls: CallbackOptions[] = [];
  const listeners = new Map<string, Set<(event: { persisted: boolean }) => void>>();
  let index = 0;
  let session = { data: options.session ?? null, isPending: options.pending ?? false };
  const search = readLoginSearch(options.search);
  const Page = () => null;
  const Navigate = () => null;
  const module = { exports: {} as {
    LoginRoute?: () => React.ReactElement<AuthPageProps>;
    SignupRoute?: () => React.ReactElement<AuthPageProps>;
    Route: { validateSearch: typeof readLoginSearch };
  } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    window: {
      addEventListener(type: string, listener: (event: { persisted: boolean }) => void) {
        const registered = listeners.get(type) ?? new Set();
        registered.add(listener); listeners.set(type, registered);
      },
      removeEventListener(type: string, listener: (event: { persisted: boolean }) => void) {
        listeners.get(type)?.delete(listener);
      },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: unknown) => {
          const slot = index++;
          if (!(slot in values)) values[slot] = initial;
          return [values[slot], (value: unknown) => { values[slot] = value; updates.push({ slot, value }); }];
        },
        useRef: (initial: unknown) => {
          const slot = index++;
          if (!(slot in values)) values[slot] = { current: initial };
          return values[slot];
        },
        useEffect: (effect: () => void | (() => void)) => {
          const slot = index++;
          if (!(slot in values)) { values[slot] = true; effects.push(effect); }
        },
      };
      if (specifier === "@tanstack/react-router") return {
        Navigate,
        createFileRoute: () => (configuration: Record<string, unknown>) => ({ ...configuration, useSearch: () => search }),
      };
      if (specifier === "@/lib/auth-client") return { authClient: {
        useSession: () => session,
        signIn: { social: async (callbacks: CallbackOptions) => {
          calls.push(callbacks);
          return options.social ? options.social(callbacks) : { error: null, data: { redirect: true, url: "https://provider.example/authorize" } };
        } },
      } };
      if (specifier === "@/components/auth/auth-page") return { AuthPage: Page };
      if (specifier === "@/lib/login") return login;
      throw new Error(`Unexpected ${mode} dependency: ${specifier}`);
    },
  });
  const component = mode === "signup" ? module.exports.SignupRoute : module.exports.LoginRoute;
  assert.ok(component, `${mode} exports its real route component`);
  function render() { index = 0; return component!(); }
  render();
  effects.splice(0).forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  return {
    calls, updates, Page, Navigate,
    render,
    get page() { const element = render(); assert.equal(element.type, Page); return element.props; },
    setSession(data: typeof session) { session = data; },
    unmount() { cleanups.splice(0).forEach((cleanup) => cleanup()); },
    listenerCount(type: string) { return listeners.get(type)?.size ?? 0; },
    pageShow(persisted: boolean) { listeners.get("pageshow")?.forEach((listener) => listener({ persisted })); },
    validateSearch: module.exports.Route.validateSearch,
  };
}
