import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import {
  loginCallbackErrorMessage,
  loginCallbacks,
  normalizeLoginRedirect,
  readLoginSearch,
} from "../src/lib/login";
import { authRouteController, deferred, settle, type AuthControllerOptions, type AuthResult } from "./auth-flow.fixture";

test("safe return destinations retain CLI codes, invitation tokens, and workspace query parameters", () => {
  for (const destination of [
    "/select", "/onboarding", "/acme/uptime",
    "/cli/login?code=one-time-code", "/invitations/accept?token=invitation-id",
    "/acme/observability/requests?range=24h&service=checkout-api&search=%2Fapi%2Forders",
  ]) {
    assert.equal(normalizeLoginRedirect(destination), destination);
    assert.deepEqual(readLoginSearch({ redirect: destination }), { redirect: destination });
    for (const provider of ["github", "google"] as const) {
      const callbacks = loginCallbacks(provider, destination);
      assert.equal(callbacks.provider, provider);
      assert.equal(callbacks.callbackURL, destination);
      assert.equal(callbacks.newUserCallbackURL, destination);
      const errorReturn = new URL(callbacks.errorCallbackURL, "https://outray.invalid");
      assert.equal(errorReturn.pathname, "/login");
      assert.equal(errorReturn.searchParams.get("redirect"), destination);
    }
  }
});

test("default callbacks distinguish existing accounts from newly registered accounts", () => {
  for (const provider of ["github", "google"] as const) {
    assert.deepEqual(loginCallbacks(provider), {
      provider, callbackURL: "/select", newUserCallbackURL: "/onboarding", errorCallbackURL: "/login",
    });
  }
  assert.deepEqual(readLoginSearch(), {});
  assert.equal(loginCallbackErrorMessage(), null);
});

test("external, protocol-relative, malformed, control-character and login-loop redirects are rejected", () => {
  const rejected = [
    undefined, null, false, 1, {}, ["/select"], "", "select",
    "https://evil.example", "http://outray.co/select", "//evil.example", "///evil.example",
    "javascript:alert(1)", "/\\evil.example", "/%2fevil.example", "/%2Fevil.example", "/%5cevil.example",
    "/select#fragment", "/select\n", "/select\u0000", "/select next", "/select\t", "/select\u0085",
    "/login", "/login/", "/login?redirect=/select", "/signup", "/signup///", "/./login", "/acme/../signup",
    "/" + "x".repeat(2_048),
  ];
  for (const value of rejected) {
    assert.equal(normalizeLoginRedirect(value), undefined, JSON.stringify(value));
    assert.deepEqual(readLoginSearch({ redirect: value }), {}, JSON.stringify(value));
  }
  assert.deepEqual(loginCallbacks("github", "//evil.example"), {
    provider: "github", callbackURL: "/select", newUserCallbackURL: "/onboarding", errorCallbackURL: "/login",
  });
});

test("OAuth callback errors are reduced to safe cancelled or failed messages", () => {
  for (const error of ["access_denied", "user_cancelled", "cancelled"]) {
    assert.deepEqual(readLoginSearch({ error, error_description: "private provider details" }), { error: "cancelled" });
    assert.match(loginCallbackErrorMessage("cancelled")!, /cancelled.*try again/i);
  }
  for (const error of ["state_mismatch", "internal_server_error", '<script>alert("private")</script>']) {
    const search = readLoginSearch({ error, error_description: "private provider details", redirect: "/cli/login?code=abc" });
    assert.deepEqual(search, { redirect: "/cli/login?code=abc", error: "failed" });
    assert.equal(loginCallbackErrorMessage(search.error), "Sign-in couldn’t be completed. Please try again.");
    assert.ok(!loginCallbackErrorMessage(search.error)!.includes("private"));
  }
  for (const error of [undefined, null, 1, false, {}, []]) assert.deepEqual(readLoginSearch({ error }), {});
});

const routeController = (options: AuthControllerOptions = {}) => authRouteController("login", options);

test("the actual route uses safe search parsing and does not start OAuth while session loading", async () => {
  const controller = await routeController({ pending: true });
  assert.equal(controller.validateSearch, readLoginSearch);
  assert.equal(controller.page.sessionPending, true);
  controller.page.onLogin("github"); controller.page.onLogin("google");
  await settle();
  assert.equal(controller.calls.length, 0);
  assert.equal(controller.page.loading, null);
  controller.setSession({ data: null, isPending: false });
  controller.page.onLogin("github");
  await settle();
  assert.equal(controller.calls.length, 1);
});

test("signed-in users return to the safe local destination without invoking OAuth", async () => {
  for (const redirect of [undefined, "/cli/login?code=abc", "/invitations/accept?token=invite", "//evil.example"]) {
    const controller = await routeController({ session: { user: { id: "existing-user" } }, search: { redirect } });
    const element = controller.render();
    assert.equal(element.type, controller.Navigate);
    const props = element.props as unknown as { href: string; replace: boolean };
    assert.equal(props.href, normalizeLoginRedirect(redirect) ?? "/select");
    assert.equal(props.replace, true);
    assert.equal(controller.calls.length, 0);
  }
});

test("installed router href navigation overrides the typed fallback and preserves callback query parameters", async () => {
  const root = createRootRoute();
  const select = createRoute({ getParentRoute: () => root, path: "/select" });
  const cli = createRoute({ getParentRoute: () => root, path: "/cli/login", validateSearch: (search: Record<string, unknown>) => ({ code: String(search.code ?? "") }) });
  const invitation = createRoute({ getParentRoute: () => root, path: "/invitations/accept", validateSearch: (search: Record<string, unknown>) => ({ token: String(search.token ?? "") }) });
  const history = createMemoryHistory({ initialEntries: ["/select"] });
  const router = createRouter({ routeTree: root.addChildren([select, cli, invitation]), history });
  await router.load();
  for (const [href, pathname, key, value] of [
    ["/cli/login?code=one-time-code", "/cli/login", "code", "one-time-code"],
    ["/invitations/accept?token=invitation-id", "/invitations/accept", "token", "invitation-id"],
  ]) {
    await router.navigate({ to: "/select", href, replace: true });
    assert.equal(router.state.location.pathname, pathname);
    assert.equal(router.state.location.search[key], value);
    assert.equal(history.location.href, href);
  }
});

test("same-tick repeated clicks send only one OAuth request with the exact provider callbacks", async () => {
  const pending = deferred<AuthResult>();
  const destination = "/invitations/accept?token=one-time-id";
  const controller = await routeController({ search: { redirect: destination }, social: () => pending.promise });
  const page = controller.page;
  page.onLogin("github"); page.onLogin("github"); page.onLogin("google");
  assert.deepEqual(controller.calls, [loginCallbacks("github", destination)]);
  assert.equal(controller.page.loading, "github");
  assert.equal(controller.page.error, null);
  pending.resolve({ error: null, data: { redirect: true, url: "https://provider.example/authorize" } });
  await settle();
  assert.equal(controller.page.loading, "github", "keep the active provider busy until the SDK leaves the page");
  controller.page.onLogin("google");
  assert.equal(controller.calls.length, 1);
});

test("returned SDK errors and thrown errors clear loading, hide private details and allow retry", async () => {
  for (const provider of ["github", "google"] as const) {
    for (const failure of ["returned", "thrown"] as const) {
      let attempts = 0;
      const controller = await routeController({ social: async () => {
        attempts++;
        if (attempts > 1) return { error: null, data: { redirect: true, url: "https://provider.example/authorize" } };
        if (failure === "thrown") throw new Error("private provider credential error");
        return { error: { message: "private provider credential error" }, data: null };
      } });
      controller.page.onLogin(provider);
      await settle();
      assert.equal(controller.page.loading, null);
      assert.equal(controller.page.error, `Could not continue with ${provider === "github" ? "GitHub" : "Google"}. Please try again.`);
      assert.ok(!controller.page.error!.includes("private"));
      controller.page.onLogin(provider);
      assert.equal(controller.page.error, null, "a retry clears the previous action error");
      await settle();
      assert.equal(controller.calls.length, 2);
      assert.equal(controller.page.loading, provider);
    }
  }
});

test("a missing provider redirect is treated as failure, not a fake successful sign-in", async () => {
  for (const data of [undefined, null, {}, { redirect: false, url: "https://provider.example" }, { redirect: true, url: "" }]) {
    const controller = await routeController({ social: async () => ({ data, error: null }) });
    controller.page.onLogin("google");
    await settle();
    assert.equal(controller.page.loading, null);
    assert.match(controller.page.error!, /Could not continue with Google/);
  }
});

test("callback errors use fixed public messages instead of provider text", async () => {
  const cancelled = await routeController({ search: { error: "access_denied", error_description: "private provider information" } });
  assert.equal(cancelled.page.error, loginCallbackErrorMessage("cancelled"));
  const failed = await routeController({ search: { error: '<script>private</script>', error_description: "private provider information" } });
  assert.equal(failed.page.error, loginCallbackErrorMessage("failed"));
  assert.ok(!failed.page.error!.includes("private"));
});

test("the controller forwards only validated return destinations to the sign-up link", async () => {
  for (const redirect of ["/cli/login?code=one-time-code", "/invitations/accept?token=invite-id", "//evil.example", undefined]) {
    const controller = await routeController({ search: { redirect } });
    assert.equal(controller.page.redirect, normalizeLoginRedirect(redirect));
  }
});

test("retrying a cancelled or failed callback clears its old message while OAuth is in flight", async () => {
  for (const error of ["access_denied", "state_mismatch"]) {
    const pending = deferred<AuthResult>();
    const controller = await routeController({ search: { error }, social: () => pending.promise });
    assert.equal(controller.page.error, loginCallbackErrorMessage(error === "access_denied" ? "cancelled" : "failed"));
    controller.page.onLogin("google");
    assert.equal(controller.page.loading, "google");
    assert.equal(controller.page.error, null, "a stale callback error must not remain beside a new sign-in attempt");
    pending.resolve({ error: { message: "private provider details" }, data: null });
    await settle();
    assert.equal(controller.page.loading, null);
    assert.equal(controller.page.error, "Could not continue with Google. Please try again.");
  }
});

test("a late OAuth failure after unmount never writes component state", async () => {
  for (const failure of ["returned", "thrown"] as const) {
    const pending = deferred<AuthResult>();
    const controller = await routeController({ social: () => pending.promise });
    controller.page.onLogin("github");
    const updateCount = controller.updates.length;
    controller.unmount();
    if (failure === "returned") pending.resolve({ error: { message: "private" }, data: null });
    else pending.reject(new Error("private"));
    await settle();
    assert.equal(controller.updates.length, updateCount);
  }
});

test("a persisted browser-back restoration unlocks login after provider navigation", async () => {
  const controller = await routeController();
  assert.equal(controller.listenerCount("pageshow"), 1);
  controller.page.onLogin("github");
  await settle();
  assert.equal(controller.page.loading, "github");
  controller.pageShow(true);
  assert.equal(controller.page.loading, null);
  controller.page.onLogin("google");
  await settle();
  assert.equal(controller.calls.length, 2);
  assert.equal(controller.page.loading, "google");
});

test("normal page-show events preserve an in-flight login, and unmount removes restoration listeners", async () => {
  const pending = deferred<AuthResult>();
  const controller = await routeController({ social: () => pending.promise });
  controller.page.onLogin("github");
  const updateCount = controller.updates.length;
  controller.pageShow(false);
  assert.equal(controller.updates.length, updateCount);
  assert.equal(controller.page.loading, "github");
  controller.page.onLogin("google");
  assert.equal(controller.calls.length, 1);
  controller.unmount();
  assert.equal(controller.listenerCount("pageshow"), 0);
  controller.pageShow(true);
  assert.equal(controller.updates.length, updateCount);
  pending.resolve({ error: null, data: { redirect: true, url: "https://provider.example/authorize" } });
  await settle();
});
