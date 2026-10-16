import assert from "node:assert/strict";
import { test } from "node:test";
import productEmail, { type ProductEmailEvent } from "../../../shared/product-email";

const context = {
  organizationName: "Acme & Friends",
  billingUrl: "https://console.example.com/acme/billing?source=email&view=subscription",
  assetBaseUrl: "https://console.example.com",
};
const usage: ProductEmailEvent = {
  kind: "usage-warning", metric: "bandwidth", threshold: 80,
  usedBytes: 20 * 1024 ** 3, limitBytes: 25 * 1024 ** 3, resetsAt: "2026-11-01T00:00:00.000Z",
};
const payment: ProductEmailEvent = {
  kind: "payment-failed", plan: "ray", amountMinor: 1_000_000,
  currency: "NGN", provider: "paystack", periodEnd: "2026-10-15T00:00:00.000Z",
};

for (const metric of ["bandwidth", "telemetry"] as const) {
  for (const threshold of [80, 100] as const) {
    test(`${metric} ${threshold}% email explains the allowance and UTC reset`, () => {
      const rendered = productEmail.renderProductEmail({ ...usage, metric, threshold }, context);
      assert.match(rendered.subject, new RegExp(metric, "i"));
      assert.match(rendered.subject, threshold === 80 ? /80%/ : /limit reached/);
      assert.match(rendered.html, new RegExp(`at least ${threshold}%`));
      assert.match(rendered.html, /20 GiB/);
      assert.match(rendered.html, /25 GiB/);
      assert.match(rendered.html, /1 Nov 2026, 00:00 UTC/);
      assert.match(rendered.html, metric === "bandwidth" ? /Tunnel requests may stop/ : /batches may be rejected/);
      assert.match(rendered.html, /https:\/\/console.example.com\/logo.png/);
      assert.match(rendered.html, /source=email&amp;view=subscription/);
      assert.doesNotMatch(rendered.html, /reply to this|Akinkunmi/i);
    });
  }
}

test("payment failure shows the payment and recorded period without inventing access or retry promises", () => {
  const { subject, html } = productEmail.renderProductEmail(payment, context);
  assert.match(subject, /Subscription payment failed/);
  assert.match(html, /NGN(?:\s|&nbsp;|\u00a0)10,000\.00/);
  assert.match(html, />Ray</);
  assert.match(html, /Paystack/);
  assert.match(html, /Billing period end/);
  assert.match(html, /15 Oct 2026, 00:00 UTC/);
  assert.match(html, /Review billing/);
  assert.doesNotMatch(html, /retry|retries|suspend|access ends|terminate|in \d+ days/i);
});

test("Polar and currencies with no fractional minor unit render correctly", () => {
  const { html } = productEmail.renderProductEmail({ ...payment, provider: "polar", currency: "JPY", amountMinor: 1200, periodEnd: null }, context);
  assert.match(html, /JPY(?:\s|&nbsp;|\u00a0)1,200/);
  assert.match(html, /Polar/);
  assert.doesNotMatch(html, /Billing period end/);
});

const subscriptionChanges = ["activated", "plan-changed", "cancellation-scheduled", "cancellation-reversed", "ended"] as const;
for (const change of subscriptionChanges) {
  test(`subscription ${change} has a complete account notification`, () => {
    const event: ProductEmailEvent = {
      kind: "subscription-change", change, plan: "beam", previousPlan: "ray", effectiveAt: "2026-10-31T01:00:00+01:00",
    };
    const { subject, html } = productEmail.renderProductEmail(event, context);
    assert.match(subject, /Subscription/);
    assert.match(html, />Beam</);
    assert.match(html, /31 Oct 2026, 00:00 UTC/);
    assert.match(html, /Review billing/);
    assert.match(html, /Acme &amp; Friends/);
    assert.equal(html.includes("Previous plan"), change === "plan-changed");
    if (change === "plan-changed") assert.match(html, />Ray</);
    if (change === "cancellation-scheduled") assert.match(html, /current plan remains available until then/);
    if (change === "cancellation-reversed") assert.match(html, /scheduled cancellation.*has been removed/);
    if (change === "ended") assert.match(html, /subscription.*has ended/);
  });
}

test("unknown cancellation date directs to billing without guessing a deadline", () => {
  const { html } = productEmail.renderProductEmail({
    kind: "subscription-change", change: "cancellation-scheduled", plan: "ray", effectiveAt: null,
  }, context);
  assert.match(html, /Review billing for the effective date/);
  assert.doesNotMatch(html, /current plan remains available until then|Effective date<\/td>/);
});

test("event parser normalizes timestamps and discards unrelated persisted data", () => {
  assert.deepEqual(productEmail.parseProductEmailEvent({ ...usage, resetsAt: "2026-11-01T01:00:00+01:00", token: "do-not-render" }), usage);
  assert.deepEqual(productEmail.parseProductEmailEvent(payment), payment);
  assert.deepEqual(productEmail.parseProductEmailEvent({ ...usage, usedBytes: 0, limitBytes: 0 }), { ...usage, usedBytes: 0, limitBytes: 0 });
});

test("event parser rejects invalid kinds, enum values, missing fields, and unbounded strings", () => {
  for (const event of [
    null, [], "{}", { kind: "secret" },
    { ...usage, metric: "ai-tokens" }, { ...usage, threshold: 99 },
    { ...payment, provider: "unknown" }, { ...payment, plan: "" },
    { ...payment, plan: "a".repeat(81) }, { ...payment, plan: "ray\r\nBcc: attacker@example.com" },
    { ...payment, periodEnd: undefined },
    { kind: "subscription-change", change: "unknown", plan: "ray", effectiveAt: null },
    { kind: "subscription-change", change: "ended", plan: "ray", previousPlan: 5, effectiveAt: null },
  ]) {
    assert.throws(() => productEmail.parseProductEmailEvent(event), /Invalid product email event/);
  }
});

test("event parser requires finite safe nonnegative integer amounts", () => {
  for (const amount of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "100", null]) {
    for (const field of ["usedBytes", "limitBytes"]) {
      assert.throws(() => productEmail.parseProductEmailEvent({ ...usage, [field]: amount }), /Invalid product email event/);
    }
    assert.throws(() => productEmail.parseProductEmailEvent({ ...payment, amountMinor: amount }), /Invalid product email event/);
  }
});

test("event parser rejects unsafe or malformed currency values", () => {
  for (const currency of ["usd", "US", "USDD", "U$D", "<b>", "USD\n", "", null]) {
    assert.throws(() => productEmail.parseProductEmailEvent({ ...payment, currency }), /currency/);
  }
});

test("event parser rejects invalid or ambiguous dates", () => {
  for (const resetsAt of [
    "not-a-date", "2026-11-01", "2026-11-01T00:00:00", "2026-02-29T00:00:00Z",
    "2026-02-30T00:00:00Z", "2026-13-01T00:00:00Z", "2026-01-00T00:00:00Z",
    "2026-01-01T24:00:00Z", "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00", "2026-01-01T00:00:00+01:60", null,
  ]) {
    assert.throws(() => productEmail.parseProductEmailEvent({ ...usage, resetsAt }), /resetsAt/);
    assert.throws(() => productEmail.parseProductEmailEvent({ ...payment, periodEnd: resetsAt ?? "invalid" }), /periodEnd/);
  }
  assert.equal(productEmail.parseProductEmailEvent({ ...usage, resetsAt: "2028-02-29T00:00:00Z" }).kind, "usage-warning");
});

test("all dynamic HTML content is escaped and unsafe CTA and asset URLs are rejected", () => {
  const { html } = productEmail.renderProductEmail({ ...payment, plan: '<script>alert("plan")</script>' }, {
    ...context, organizationName: '<img src=x onerror="alert(1)"> & Friends',
  });
  assert.doesNotMatch(html, /<script>|<img src=x|onerror="alert/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Friends/);
  assert.match(html, /&lt;Script&gt;/);
  for (const url of ["javascript:alert(1)", "https://user:pass@example.com/billing"]) {
    assert.throws(() => productEmail.renderProductEmail(payment, { ...context, billingUrl: url }), /HTTP\(S\)/);
    assert.throws(() => productEmail.renderProductEmail(payment, { ...context, assetBaseUrl: url }), /HTTP\(S\)/);
  }
  assert.throws(() => productEmail.renderProductEmail(payment, { ...context, organizationName: "Acme\nBcc: test@example.com" }), /organizationName/);
  assert.throws(() => productEmail.renderProductEmail({ ...payment, amountMinor: NaN }, context), /amountMinor/);
});
