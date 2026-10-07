import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DomainCard } from "../src/components/domains/domain-card";
import { SubdomainCard } from "../src/components/subdomains/subdomain-card";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

const createdAt = "2026-10-04T09:00:00.000Z";
const domain = {
  id: "domain-ownership-token",
  domain: "api.eu.example.co.uk",
  status: "pending" as const,
  createdAt,
};
const subdomain = { id: "subdomain-1", subdomain: "preview", createdAt };
const noop = async () => {};

function renderDomain(props: Partial<React.ComponentProps<typeof DomainCard>> = {}) {
  return renderToStaticMarkup(React.createElement(DomainCard, {
    domain,
    onDelete: noop,
    onVerify: noop,
    isVerifying: false,
    ...props,
  }));
}

function renderSubdomain(props: Partial<React.ComponentProps<typeof SubdomainCard>> = {}) {
  return renderToStaticMarkup(React.createElement(SubdomainCard, {
    subdomain,
    onDelete: noop,
    ...props,
  }));
}

function buttons(html: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
}

function namedButton(html: string, label: string) {
  const button = buttons(html).find((candidate) => candidate.includes(`aria-label="${label}"`));
  assert.ok(button, `a native button is named ${label}`);
  return button;
}

function opening(button: string) {
  return button.match(/<button\b[^>]*>/)?.[0] ?? "";
}

function disclosurePanel(html: string, button: string) {
  const id = opening(button).match(/aria-controls="([^"]+)"/)?.[1];
  assert.ok(id, "DNS disclosure identifies the panel it controls");
  const panel = [...html.matchAll(/<div\b[^>]*>/g)].map(([element]) => element)
    .find((element) => element.includes(`id="${id}"`));
  assert.ok(panel, "the DNS controls target exists even while collapsed");
  return panel;
}

test("each domain state starts compact with a named DNS disclosure and removal control", () => {
  for (const [status, label] of [
    ["active", "Active"],
    ["pending", "Pending DNS"],
    ["failed", "Needs attention"],
  ] as const) {
    const html = renderDomain({ domain: { ...domain, status } });
    const toggleLabel = status === "active" ? "DNS records" : "Set up DNS";
    const toggle = namedButton(html, `${toggleLabel} for ${domain.domain}`);
    assert.match(html, new RegExp(`>${label}<`));
    assert.match(opening(toggle), /aria-expanded="false"/);
    assert.match(disclosurePanel(html, toggle), /\bhidden=""/);
    assert.equal(buttons(html).length, 2);
    namedButton(html, `Remove domain ${domain.domain}`);
    assert.doesNotMatch(html, /<table\b|<code\b|data-copy-state=|>Verify DNS<|>Failed</);
  }
});

test("explicitly expanded domains expose the same full DNS records in every status", () => {
  for (const status of ["active", "pending", "failed"] as const) {
    const html = renderDomain({ domain: { ...domain, status }, defaultExpanded: true });
    const toggleLabel = status === "active" ? "DNS records" : "Set up DNS";
    const toggle = namedButton(html, `${toggleLabel} for ${domain.domain}`);
    assert.match(opening(toggle), /aria-expanded="true"/);
    assert.doesNotMatch(disclosurePanel(html, toggle), /\bhidden=/);
    assert.ok(html.includes(`<caption class="sr-only">${domain.domain} DNS records</caption>`));
    assert.equal((html.match(/scope="col"/g) ?? []).length, 3);
    assert.equal((html.match(/scope="row"/g) ?? []).length, 2);
    assert.match(html, /Full hostnames are shown/);
    assert.match(html, /provider appends the DNS zone, enter only the relative name/);
    for (const [type, name, value] of [
      ["CNAME", domain.domain, "edge.outray.app"],
      ["TXT", `_outray-challenge.${domain.domain}`, domain.id],
    ]) {
      const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([record]) => record)
        .find((record) => record.includes(`>${type}</th>`));
      assert.ok(row, `${type} has its own DNS row`);
      const codes = [...row.matchAll(/<code\b[^>]*>([^<]*)<\/code>/g)].map(([, code]) => code);
      assert.deepEqual(codes, [name, value], `${type} retains the verifier's full owner name and value`);
      for (const field of ["name", "value"]) {
        const copy = namedButton(row, `Copy ${type} ${field} for ${domain.domain}`);
        assert.match(opening(copy), /type="button"/);
        assert.match(opening(copy), /data-copy-state="idle"/);
      }
    }
    assert.equal((html.match(/data-copy-state="idle"/g) ?? []).length, 4);
    assert.ok(buttons(html).some((button) => button.includes(">Verify DNS</span>")));
  }
});

test("pending verification locks disclosure and removal while keeping the busy Verify action focusable", () => {
  const html = renderDomain({ defaultExpanded: true, isVerifying: true });
  const toggle = namedButton(html, `Set up DNS for ${domain.domain}`);
  const remove = namedButton(html, `Remove domain ${domain.domain}`);
  assert.match(opening(toggle), /\bdisabled=""/);
  assert.match(opening(remove), /\bdisabled=""/);
  assert.match(opening(toggle), /aria-expanded="true"/);
  const verify = buttons(html).find((button) => button.includes("Checking DNS…"));
  assert.ok(verify);
  assert.match(opening(verify), /type="button"/);
  assert.match(opening(verify), /aria-busy="true"/);
  assert.match(opening(verify), /aria-disabled="true"/);
  assert.match(opening(verify), /tabindex="0"/);
  assert.doesNotMatch(opening(verify), /\sdisabled=/);
  assert.equal((html.match(/data-copy-state="idle"/g) ?? []).length, 4,
    "the visible record values can still be copied while verification runs");
});

test("reserved subdomains expose their full address and visible named copy/release buttons", () => {
  const html = renderSubdomain();
  assert.match(html, /aria-label="Reserved subdomain preview\.outray\.app"/);
  assert.match(html, /title="preview\.outray\.app"/);
  assert.match(html, />preview\.outray\.app<\/h3>/);
  assert.match(html, />Reserved<\/span>/);
  assert.equal(buttons(html).length, 2);
  const copy = namedButton(html, "Copy address preview.outray.app");
  assert.match(opening(copy), /data-copy-state="idle"/);
  const release = namedButton(html, "Release subdomain preview.outray.app");
  assert.match(opening(release), /aria-haspopup="dialog"/);
  assert.match(opening(release), /aria-expanded="false"/);
  assert.doesNotMatch(html, /role="dialog"/);
});

test("resource actions remain keyboard-native and are not hidden behind pointer-hover styling", () => {
  for (const html of [renderSubdomain(), renderDomain(), renderDomain({ defaultExpanded: true })]) {
    for (const button of buttons(html)) {
      const tag = opening(button);
      assert.match(tag, /type="button"/);
      assert.doesNotMatch(tag, /tabindex="-1"|\sdisabled=|aria-hidden="true"/);
      assert.doesNotMatch(tag, /opacity-0|group-hover:opacity|\b(?:sm|md):hidden/);
    }
  }
});

test("quiet row hover is reduced-motion-aware and stays off the expanded DNS surface", () => {
  const subdomainArticle = renderSubdomain().match(/<article\b[^>]*>/)?.[0];
  const domainHtml = renderDomain({ defaultExpanded: true });
  const domainArticle = domainHtml.match(/<article\b[^>]*>/)?.[0];
  const domainSummary = domainHtml.match(/<article\b[^>]*>\s*(<div\b[^>]*>)/)?.[1];
  assert.ok(subdomainArticle && domainArticle && domainSummary);
  for (const surface of [subdomainArticle, domainSummary]) {
    const classes = surface.match(/class="([^"]+)"/)?.[1].split(/\s+/) ?? [];
    for (const expected of ["transition-colors", "hover:bg-white/[0.025]", "motion-reduce:transition-none"]) {
      assert.ok(classes.includes(expected), `the resource summary retains ${expected}`);
    }
  }
  assert.doesNotMatch(domainArticle, /hover:bg/,
    "expanded DNS records do not inherit the summary's hover treatment");
});

test("Date and ISO-string timestamps agree, while invalid dates have safe neutral fallback copy", () => {
  const date = new Date(createdAt);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  for (const timestamp of [createdAt, date]) {
    const domainHtml = renderDomain({ domain: { ...domain, createdAt: timestamp } });
    const subdomainHtml = renderSubdomain({ subdomain: { ...subdomain, createdAt: timestamp } });
    assert.ok(domainHtml.includes(`<time dateTime="${createdAt}">Added ${formatted}</time>`));
    assert.ok(subdomainHtml.includes(`<time dateTime="${createdAt}">Reserved ${formatted}</time>`));
  }
  for (const timestamp of ["not-a-date", new Date(NaN)]) {
    const domainHtml = renderDomain({ domain: { ...domain, createdAt: timestamp } });
    const subdomainHtml = renderSubdomain({ subdomain: { ...subdomain, createdAt: timestamp } });
    assert.match(domainHtml, /<time>Added date unavailable<\/time>/);
    assert.match(subdomainHtml, /<time>Reservation date unavailable<\/time>/);
    assert.doesNotMatch(domainHtml + subdomainHtml, /Invalid Date|dateTime=""/);
  }
});

test("rendering resource cards never verifies or deletes a resource", () => {
  const calls: string[] = [];
  const onDelete = async (id: string) => { calls.push(`delete:${id}`); };
  const onVerify = async (id: string) => { calls.push(`verify:${id}`); };
  renderSubdomain({ onDelete });
  for (const status of ["active", "pending", "failed"] as const) {
    renderDomain({ domain: { ...domain, status }, defaultExpanded: true, onDelete, onVerify });
  }
  assert.deepEqual(calls, []);
});

test("copy controls use the displayed full DNS names, exact ownership token, and reserved address", async () => {
  const [domainSource, subdomainSource] = await Promise.all([
    readFile(new URL("../src/components/domains/domain-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/subdomains/subdomain-card.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(domainSource, /type:\s*"CNAME",\s*name:\s*domain\.domain,\s*value:\s*"edge\.outray\.app"/);
  assert.match(domainSource, /type:\s*"TXT",\s*name:\s*`_outray-challenge\.\$\{domain\.domain\}`,\s*value:\s*domain\.id/);
  assert.match(domainSource, /<CopyButton\b[^>]*value=\{record\.name\}/);
  assert.match(domainSource, /<CopyButton\b[^>]*value=\{record\.value\}/);
  assert.doesNotMatch(domainSource, /getRecordName|\.split\("\."\)|navigator\.clipboard|setTimeout/);
  assert.match(subdomainSource, /const address = `\$\{subdomain\.subdomain\}\.outray\.app`/);
  assert.match(subdomainSource, /<CopyButton\b[^>]*value=\{address\}/);
  assert.match(domainSource, /onConfirm=\{\(\) => onDelete\(domain\.id\)\}/);
  assert.match(subdomainSource, /onConfirm=\{\(\) => onDelete\(subdomain\.id\)\}/);
});

test("verification awaits its own resource, guards reentry, and keeps DNS visible on inline error", async () => {
  const source = await readFile(new URL("../src/components/domains/domain-card.tsx", import.meta.url), "utf8");
  assert.match(source, /const verificationPending = isChecking \|\| isVerifying/);
  assert.match(source, /if \(verifyInFlight\.current \|\| isVerifying\) return/);
  assert.match(source, /verifyInFlight\.current = true;[\s\S]*?await onVerify\(domain\.id\)/);
  assert.match(source, /catch \(reason\)\s*\{\s*setVerifyError\(/);
  assert.match(source, /finally\s*\{\s*verifyInFlight\.current = false;\s*setIsChecking\(false\)/);
  assert.match(source, /verifyError[\s\S]*?<p role="alert"[^>]*>\{verifyError\}<\/p>/);
  assert.doesNotMatch(source, /setIsDnsOpen\(false\)/);
  assert.match(source, /loading=\{verificationPending\}/);
});

test("the shared delete dialog closes only after awaited success and retains failures for retry", async () => {
  const source = await readFile(new URL("../src/components/resource-delete-dialog.tsx", import.meta.url), "utf8");
  assert.match(source, /onConfirm:\s*\(\) => Promise<unknown>/);
  assert.match(source, /if \(inFlight\.current \|\| disabled\) return/);
  assert.match(source, /inFlight\.current = true;[\s\S]*?try\s*\{\s*await onConfirm\(\);\s*setIsOpen\(false\);\s*\} catch/);
  const errorBranch = source.match(/catch \(reason\)\s*\{([\s\S]*?)\}\s*finally/)?.[1];
  assert.ok(errorBranch);
  assert.match(errorBranch, /setError\(/);
  assert.doesNotMatch(errorBranch, /setIsOpen\(false\)/);
  assert.match(source, /finally\s*\{\s*inFlight\.current = false;\s*setIsPending\(false\)/);
  assert.match(source, /error && <p role="alert"[^>]*>\{error\}<\/p>/);
  const buttons = [...source.matchAll(/<Button\b[\s\S]*?>/g)].map(([button]) => button);
  assert.equal(buttons.length, 3);
  for (const button of buttons.slice(1)) assert.match(button, /size="sm"/, "confirmation actions use the shared small size");
});

test("pending deletion guards all dismissal routes and focuses the safe Cancel action first", async () => {
  const source = await readFile(new URL("../src/components/resource-delete-dialog.tsx", import.meta.url), "utf8");
  assert.match(source, /onOpenChange=\{\(open\) => \{\s*if \(inFlight\.current\) return/);
  assert.match(source, /closeDisabled=\{isPending\}/);
  assert.match(source, /onEscapeKeyDown=\{\(event\) => \{\s*if \(inFlight\.current\) event\.preventDefault\(\)/);
  assert.match(source, /onPointerDownOutside=\{\(event\) => \{\s*if \(inFlight\.current\) event\.preventDefault\(\)/);
  assert.match(source, /onOpenAutoFocus=\{\(event\) => \{\s*event\.preventDefault\(\);\s*cancelRef\.current\?\.focus\(\)/);
  assert.match(source, /ref=\{cancelRef\}[\s\S]*?disabled=\{isPending\}/);
  assert.match(source, /variant="danger"[\s\S]*?loading=\{isPending\}/);
  assert.match(source, /<DialogContent\s+className="outray-arc"/);
});
