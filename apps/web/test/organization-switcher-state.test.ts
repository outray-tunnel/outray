import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSwitcherOrganizations,
  organizationInitials,
  organizationLogo,
  organizationSwitchDestination,
  type SwitcherOrganization,
} from "../src/components/sidebar/organization-switcher-state";

test("switching organizations preserves each audited static page and canonicalizes legacy sections", () => {
  const sections = [
    "", "/tunnels", "/requests", "/subdomains", "/domains", "/members", "/tokens", "/billing",
    "/settings", "/settings/profile", "/settings/organization", "/get-started", "/setup",
    "/observability", "/observability/alerts", "/observability/services", "/observability/requests",
    "/observability/logs", "/observability/metrics", "/observability/traces",
    "/secrets", "/secrets/vaults", "/secrets/shares", "/secrets/trash", "/secrets/audit",
    "/uptime", "/uptime/monitors", "/uptime/incidents", "/uptime/notifications", "/uptime/status-page",
    "/uptime/status-page/appearance", "/uptime/status-page/components", "/uptime/status-page/domains", "/uptime/status-page/publishing",
  ];
  for (const section of sections) {
    assert.equal(organizationSwitchDestination(`/current${section}`, "current", "next"), `/next${section}`, section);
    assert.equal(organizationSwitchDestination(`/current${section}/`, "current", "next"), `/next${section}`, "trailing slashes do not change the destination");
  }
  assert.equal(organizationSwitchDestination("/current/secrets/projects", "current", "next"), "/next/secrets/vaults");
  assert.equal(organizationSwitchDestination("/current/observability/monitors", "current", "next"), "/next/observability/alerts");
});

test("organization-scoped detail IDs and nested tabs return to their corresponding list", () => {
  const mappings = [
    ["/secrets/vaults/payments", "/secrets/vaults"],
    ["/secrets/vaults/payments/environments/production", "/secrets/vaults"],
    ["/secrets/projects/payments", "/secrets/vaults"],
    ["/secrets/projects/payments/environments/staging", "/secrets/vaults"],
    ["/tunnels/tunnel-123", "/tunnels"],
    ["/uptime/monitors/monitor-123", "/uptime/monitors"],
    ["/uptime/incidents/incident-123", "/uptime/incidents"],
    ["/observability/services/service-123", "/observability/services"],
    ["/observability/alerts/alert-123", "/observability/alerts"],
    ["/observability/alerts/alert-123/condition", "/observability/alerts"],
    ["/observability/alerts/alert-123/evaluations", "/observability/alerts"],
    ["/observability/alerts/alert-123/incidents", "/observability/alerts"],
    ["/observability/alerts/alert-123/notifications", "/observability/alerts"],
    ["/secrets/vaults/encoded%2Fidentifier/environments/env%3Fname", "/secrets/vaults"],
  ];
  for (const [source, destination] of mappings) {
    assert.equal(organizationSwitchDestination(`/current${source}`, "current", "next"), `/next${destination}`, source);
  }
});

test("targets encode the next slug, recognize encoded current slugs, and cannot retain unknown or mismatched paths", () => {
  assert.equal(organizationSwitchDestination("/team%20%2F%3F%CE%B2/secrets/vaults/api", "team /?β", "next /?β"), "/next%20%2F%3F%CE%B2/secrets/vaults");
  for (const source of ["/other/billing", "/current/unknown", "/current/settings/unknown", "/current/secrets/vaults-unsafe/api", "/currentish/members", "/%E0%A4%A/billing", "current/billing", "https://evil.test/current/billing", "//evil.test/current/billing"]) {
    assert.equal(organizationSwitchDestination(source, "current", "next"), "/next", source);
  }
  assert.equal(organizationSwitchDestination("/current/tunnels/t-123?tab=requests#request-456", "current", "next"), "/next/tunnels", "only the destination path survives a detail fallback");
});

test("organization search is trimmed, case-insensitive, name-or-slug based and preserves input order without mutation", () => {
  const organizations: readonly SwitcherOrganization[] = Object.freeze([
    Object.freeze({ id: "1", name: "Payments Team", slug: "payments", logo: "/payments.png" }),
    Object.freeze({ id: "2", name: "Research", slug: "PAYMENTS-lab" }),
    Object.freeze({ id: "3", name: "Operations", slug: "ops" }),
  ]);
  const found = filterSwitcherOrganizations(organizations, " PaYmEnTs ");
  assert.deepEqual(found.map((organization) => organization.id), ["1", "2"]);
  assert.equal(found[0], organizations[0]); assert.equal(found[1], organizations[1]);
  assert.deepEqual(filterSwitcherOrganizations(organizations, "operations"), [organizations[2]]);
  assert.deepEqual(filterSwitcherOrganizations(organizations, " ops "), [organizations[2]]);
  assert.deepEqual(filterSwitcherOrganizations(organizations, "no match"), []);
  const all = filterSwitcherOrganizations(organizations, " \t ");
  assert.deepEqual(all, organizations); assert.notEqual(all, organizations);
  assert.deepEqual(organizations.map((organization) => organization.id), ["1", "2", "3"]);
});

test("organization initials use first and last words, one letter for a single word, and a safe empty fallback", () => {
  for (const [name, initials] of [[" Payments Team ", "PT"], ["one middle last", "OL"], ["outray", "O"], [" \t\n ", "O"], ["équipe Lagos", "ÉL"], ["Alpha\nBeta\tGamma", "AG"]]) {
    assert.equal(organizationInitials(name), initials);
  }
});

test("organization logos allow HTTPS, root-relative images and constrained raster data URLs only", () => {
  const allowed = ["https://cdn.example.com/org.png", "HTTPS://cdn.example.com/org.webp", "/org/logo.svg", "/logo.png?size=48#image", "data:image/png;base64,aGVsbG8=", "data:image/jpeg;base64,aGVsbG8=", "data:image/webp;base64,aGVsbG8="];
  for (const logo of allowed) assert.equal(organizationLogo(` ${logo} `), logo);
  for (const logo of [undefined, null, "", " ", "http://example.com/logo.png", "//example.com/logo.png", "/\\example.com/logo.png", "https://example.com\\logo.png", "javascript:alert(1)", "blob:https://example.com/id", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PHNjcmlwdD4=", "data:image/png;utf8,payload", "images/logo.png", "https://", "https:example.com/logo.png", "https://example.com/\nlogo.png"]) {
    assert.equal(organizationLogo(logo), null, String(logo));
  }
});
