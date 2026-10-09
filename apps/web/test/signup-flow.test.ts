import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLoginRedirect, readLoginSearch, signupCallbacks, signupCallbackErrorMessage } from "../src/lib/login";
import { authRouteController, deferred, settle, type AuthControllerOptions, type AuthResult } from "./auth-flow.fixture";

const routeController = (options: AuthControllerOptions = {}) => authRouteController("signup", options);

test("sign-up callbacks keep existing users on select and new users on onboarding by default", () => {
  for (const provider of ["github", "google"] as const) {
    assert.deepEqual(signupCallbacks(provider), {
      provider, callbackURL: "/select", newUserCallbackURL: "/onboarding", errorCallbackURL: "/signup",
    });
  }
});

test("sign-up preserves CLI, invitation and workspace destinations and returns OAuth errors to signup", () => {
  for (const redirect of ["/cli/login?code=one-time-code", "/invitations/accept?token=invite-id", "/acme/uptime?tab=monitors"]) {
    for (const provider of ["github", "google"] as const) {
      const callbacks = signupCallbacks(provider, redirect);
      assert.equal(callbacks.provider, provider);
      assert.equal(callbacks.callbackURL, redirect);
      assert.equal(callbacks.newUserCallbackURL, redirect);
      const errorReturn = new URL(callbacks.errorCallbackURL, "https://outray.invalid");
      assert.equal(errorReturn.pathname, "/signup");
      assert.equal(errorReturn.searchParams.get("redirect"), redirect);
      assert.ok(!callbacks.errorCallbackURL.startsWith("/login"));
    }
  }
});

test("unsafe or recursive destinations cannot change sign-up callbacks", () => {
  for (const redirect of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2fevil.example", "/login", "/signup?redirect=/acme", "/acme\n", "/acme#fragment"]) {
    assert.equal(normalizeLoginRedirect(redirect), undefined);
    assert.deepEqual(signupCallbacks("google", redirect), {
      provider: "google", callbackURL: "/select", newUserCallbackURL: "/onboarding", errorCallbackURL: "/signup",
    });
  }
});

test("sign-up callback messages distinguish cancellation and failure without provider descriptions", () => {
  assert.equal(signupCallbackErrorMessage(), null);
  assert.equal(signupCallbackErrorMessage("cancelled"), "Sign-up was cancelled. Choose an option below to try again.");
  assert.equal(signupCallbackErrorMessage("failed"), "Sign-up couldn’t be completed. Please try again.");
  for (const error of ["access_denied", "state_mismatch", '<script>private provider data</script>']) {
    const parsed = readLoginSearch({ error, error_description: "private provider details" });
    assert.ok(!signupCallbackErrorMessage(parsed.error)!.includes("private"));
  }
});

test("the actual sign-up route selects the shared signup view and cannot start OAuth before session resolution", async () => {
  const controller = await routeController({ pending: true });
  assert.equal(controller.validateSearch, readLoginSearch);
  assert.equal(controller.page.mode, "signup");
  assert.equal(controller.page.sessionPending, true);
  controller.page.onLogin("github"); controller.page.onLogin("google");
  await settle();
  assert.equal(controller.calls.length, 0);
  assert.equal(controller.page.loading, null);
  controller.setSession({ data: null, isPending: false });
  controller.page.onLogin("google");
  await settle();
  assert.equal(controller.calls.length, 1);
  assert.equal(controller.page.mode, "signup");
});

test("signed-in users preserve their validated destination instead of registering or losing return queries", async () => {
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

test("sign-up ignores same-tick duplicates, sends exact callbacks and remains busy while SDK redirects", async () => {
  const pending = deferred<AuthResult>();
  const redirect = "/cli/login?code=one-time-code";
  const controller = await routeController({ search: { redirect }, social: () => pending.promise });
  const page = controller.page;
  page.onLogin("google"); page.onLogin("google"); page.onLogin("github");
  assert.deepEqual(controller.calls, [signupCallbacks("google", redirect)]);
  assert.equal(controller.page.loading, "google");
  assert.equal(controller.page.redirect, redirect);
  pending.resolve({ error: null, data: { redirect: true, url: "https://provider.example/authorize" } });
  await settle();
  assert.equal(controller.page.loading, "google");
  controller.page.onLogin("github");
  assert.equal(controller.calls.length, 1);
});

test("returned SDK errors and rejected sign-up attempts show safe errors and allow retry", async () => {
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
      assert.equal(controller.page.error, null);
      await settle();
      assert.equal(controller.calls.length, 2);
      assert.equal(controller.page.loading, provider);
    }
  }
});

test("missing sign-up redirect URLs do not produce fake success", async () => {
  for (const data of [undefined, null, {}, { redirect: false, url: "https://provider.example" }, { redirect: true, url: "" }]) {
    const controller = await routeController({ social: async () => ({ data, error: null }) });
    controller.page.onLogin("github");
    await settle();
    assert.equal(controller.page.loading, null);
    assert.match(controller.page.error!, /Could not continue with GitHub/);
  }
});

test("sign-up callback errors are sanitized, and retry removes stale cancellation messages", async () => {
  for (const error of ["access_denied", "state_mismatch", '<script>private</script>']) {
    const pending = deferred<AuthResult>();
    const controller = await routeController({ search: { error, error_description: "private" }, social: () => pending.promise });
    assert.equal(controller.page.error, signupCallbackErrorMessage(error === "access_denied" ? "cancelled" : "failed"));
    assert.ok(!controller.page.error!.includes("private"));
    controller.page.onLogin("google");
    assert.equal(controller.page.error, null);
    pending.resolve({ error: null, data: { redirect: true, url: "https://provider.example/authorize" } });
    await settle();
    assert.equal(controller.page.loading, "google");
  }
});

test("the sign-up controller passes only validated redirects to the login switch link", async () => {
  for (const redirect of ["/cli/login?code=abc", "/invitations/accept?token=invite", "//evil.example", undefined]) {
    const controller = await routeController({ search: { redirect } });
    assert.equal(controller.page.redirect, normalizeLoginRedirect(redirect));
  }
});

test("late sign-up failures after unmount cannot update the page", async () => {
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

test("a persisted browser-back restoration unlocks sign-up after provider navigation", async () => {
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

test("normal page-show events preserve an in-flight sign-up, and unmount removes restoration listeners", async () => {
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
