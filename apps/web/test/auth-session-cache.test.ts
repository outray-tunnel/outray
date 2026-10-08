import assert from "node:assert/strict";
import test from "node:test";
import { getCachedAuthSession } from "../src/lib/auth-session-cache";

function request(cookie: string): Request {
  return new Request("https://outray.test/api/team/stats/overview", {
    headers: { cookie },
  });
}

test("coalesces concurrent session reads for the same cookie", async () => {
  const previousTtl = process.env.AUTH_SESSION_CACHE_TTL_MS;
  process.env.AUTH_SESSION_CACHE_TTL_MS = "1000";
  let calls = 0;
  try {
    const load = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { user: { id: "user-a" } };
    };
    const [first, second] = await Promise.all([
      getCachedAuthSession(request("session-a"), load),
      getCachedAuthSession(request("session-a"), load),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
  } finally {
    if (previousTtl === undefined) delete process.env.AUTH_SESSION_CACHE_TTL_MS;
    else process.env.AUTH_SESSION_CACHE_TTL_MS = previousTtl;
  }
});

test("does not share sessions between different cookies", async () => {
  const previousTtl = process.env.AUTH_SESSION_CACHE_TTL_MS;
  process.env.AUTH_SESSION_CACHE_TTL_MS = "1000";
  let calls = 0;
  try {
    const load = async (request: Request) => {
      calls += 1;
      return { user: { id: request.headers.get("cookie") || "unknown" } };
    };
    const first = await getCachedAuthSession(request("session-b"), load);
    const second = await getCachedAuthSession(request("session-c"), load);
    assert.equal(calls, 2);
    assert.equal(first?.user.id, "session-b");
    assert.equal(second?.user.id, "session-c");
  } finally {
    if (previousTtl === undefined) delete process.env.AUTH_SESSION_CACHE_TTL_MS;
    else process.env.AUTH_SESSION_CACHE_TTL_MS = previousTtl;
  }
});

