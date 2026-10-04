import assert from "node:assert/strict";
import test from "node:test";
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

test("historical requests forward AbortSignal and preserve cancellation", async (t) => {
  const configurations: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    configurations.push(config);
    if (config.params.search === "obsolete") {
      return new Promise((_resolve, reject) => {
        config.signal?.addEventListener?.(
          "abort",
          () => reject(new axios.CanceledError("Request superseded")),
          { once: true },
        );
      });
    }
    if (config.params.search === "failure") {
      throw new Error("Transport failed");
    }
    return {
      data: { requests: [] },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };
  const originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = adapter;
  t.after(() => { axios.defaults.adapter = originalAdapter; });
  const { appClient } = await import("../src/lib/app-client");

  const controller = new AbortController();
  const pending = appClient.requests.list(
    "org-a",
    { range: "1h", search: "obsolete", tunnelId: "tunnel-a" },
    { signal: controller.signal },
  );
  assert.equal(configurations[0].signal, controller.signal);
  assert.equal(configurations[0].url, "/api/org-a/requests");
  assert.deepEqual(configurations[0].params, {
    range: "1h",
    search: "obsolete",
    tunnelId: "tunnel-a",
  });
  controller.abort();
  await assert.rejects(pending, (error) => axios.isCancel(error));

  assert.deepEqual(
    await appClient.requests.list("org-b", { range: "24h", search: "latest" }),
    { requests: [] },
  );
  assert.equal(configurations[1].url, "/api/org-b/requests");
  assert.deepEqual(
    await appClient.requests.list("org-b", { range: "24h", search: "failure" }),
    { error: "An unexpected error occurred" },
    "ordinary failures still return the existing structured API error",
  );
});

test("history debounce applies only to same-scope search edits", async () => {
  const { historyRequestDelay } = await import("../src/components/requests/use-requests-feed");
  const previous = { scopeKey: "org-a:tunnel-a:1h", search: "", retryVersion: 0 };
  assert.equal(historyRequestDelay(null, previous), 0, "initial load is immediate");
  assert.equal(historyRequestDelay(previous, previous), 0);
  assert.equal(
    historyRequestDelay(previous, { ...previous, search: "checkout" }),
    300,
    "typing search is debounced",
  );
  assert.equal(
    historyRequestDelay({ ...previous, search: "checkout" }, previous),
    300,
    "clearing search is also debounced",
  );
  for (const scopeKey of [
    "org-a:tunnel-a:24h",
    "org-b:tunnel-a:1h",
    "org-a:tunnel-b:1h",
  ]) {
    assert.equal(
      historyRequestDelay(previous, { ...previous, scopeKey, search: "checkout" }),
      0,
      "range and organization/tunnel changes are immediate, including a new search",
    );
  }
  assert.equal(
    historyRequestDelay(previous, { ...previous, retryVersion: 1, search: "checkout" }),
    0,
    "explicit retry is immediate",
  );
  assert.equal(
    historyRequestDelay(null, { ...previous, search: "checkout" }),
    0,
    "returning from Live starts history immediately",
  );
});
