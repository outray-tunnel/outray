import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Link, RouterContextProvider } from "@tanstack/react-router";
import { Footer } from "../src/landing/Footer";

Object.assign(globalThis, { React });

const props = {
  statusUrl: "https://status.example.com",
  loginUrl: "/login" as const,
  privacyUrl: "/privacy" as const,
  termsUrl: "/terms" as const,
  githubUrl: "https://github.com/example/custom-repository",
};
type Element = React.ReactElement<Record<string, any>>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function textContent(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return React.isValidElement(node) ? textContent((node as Element).props.children) : "";
}

function renderFooter() {
  const root = createRootRoute();
  const routes = ["products/$", "docs/$", "login", "privacy", "terms"].map((path) => createRoute({ getParentRoute: () => root, path }));
  const router = createRouter({ routeTree: root.addChildren(routes), history: createMemoryHistory({ initialEntries: ["/"] }), isServer: true });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(Footer, props) }));
}

test("footer hover belongs to each text link rather than its list or surrounding whitespace", () => {
  const footer = Footer(props);
  const nav = elements(footer).find((element) => element.type === "nav" && element.props["aria-label"] === "Footer navigation")!;
  const lists = elements(nav).filter((element) => element.type === "ul");
  assert.equal(lists.length, 3);
  for (const list of lists) {
    const classes = list.props.className;
    assert.match(classes, /\[&_a:hover\]:text-white/, "only the hovered anchor receives its hover color");
    assert.doesNotMatch(classes, /hover:\[&_a\]:|group-hover/, "hovering list whitespace must not highlight every link");
    assert.match(classes, /(?:^|\s)justify-items-start(?:\s|$)/);
    assert.match(classes, /\[&_a\]:w-fit/, "link hitboxes stay fitted to their own content");
    assert.match(classes, /\[&_a:focus-visible\]:outline-/);
    assert.match(classes, /motion-reduce:\[&_a\]:transition-none/);
  }
  for (const container of elements(footer).filter((element) => ["footer", "div", "nav", "ul", "li"].includes(String(element.type)))) {
    assert.notEqual(container.props.role, "link");
    assert.equal(container.props.onClick, undefined);
    assert.doesNotMatch(container.props.className ?? "", /(?:^|\s)cursor-pointer(?:\s|$)/);
  }
});

test("footer navigation retains real destinations without a duplicate text GitHub link", (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Rendering the footer must not fetch external destinations"); });
  const html = renderFooter();
  const navigation = html.match(/<nav aria-label="Footer navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(navigation);
  const destinations = [...navigation.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(destinations, ["/products/tunnels", "/products/observability", "/products/secrets", "/products/uptime", "/docs", props.statusUrl, "/login", "/privacy", "/terms"]);
  assert.match(html, /aria-label="OutRay home"/);
  assert.match(html, /Developer infrastructure for exposing, observing, and securing your services\./);
  assert.doesNotMatch(navigation, /GitHub|Twitter/);
  assert.doesNotMatch(html, /href="\/products\/?"/);
  assert.equal(requests, 0);
});

test("footer groups have plain text headings and correctly labelled link-list membership", () => {
  const footer = Footer(props);
  const nav = elements(footer).find((element) => element.type === "nav" && element.props["aria-label"] === "Footer navigation")!;
  const headings = elements(nav).filter((element) => element.type === "h3");
  assert.deepEqual(headings.map(textContent), ["Products", "Resources", "Company"]);
  const expectedMembers = [["Tunnels", "Observability", "Secrets", "Uptime"], ["Docs", "Status"], ["Log in", "Privacy", "Terms"]];
  headings.forEach((heading, index) => {
    assert.equal(typeof heading.props.children, "string", "group headings are plain text, not links or controls");
    assert.equal(heading.props.onClick, undefined);
    const list = elements(nav).find((element) => element.type === "ul" && element.props["aria-labelledby"] === heading.props.id);
    assert.ok(list);
    const links = elements(list).filter((element) => element.type === "a" || element.type === Link);
    assert.deepEqual(links.map(textContent), expectedMembers[index]);
  });
  for (const link of elements(nav).filter((element) => element.type === "a" || element.type === Link)) {
    assert.ok(!["Products", "Resources", "Company"].includes(textContent(link)));
  }
});

test("accessible GitHub and Twitter logo links replace the slogan while retaining copyright", () => {
  const footer = Footer(props);
  const social = elements(footer).find((element) => element.type === "nav" && element.props["aria-label"] === "OutRay social links")!;
  assert.ok(social);
  const links = elements(social).filter((element) => element.type === "a" || element.type === Link);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => [link.props["aria-label"], link.props.href]), [
    ["OutRay on GitHub", props.githubUrl],
    ["OutRay on Twitter", "https://twitter.com/outraytunnel"],
  ]);
  for (const link of links) {
    assert.equal(textContent(link), "", "the new social links are logo-only with accessible names");
    assert.equal(link.props.target, "_blank");
    assert.ok(link.props.rel.split(/\s+/).includes("noopener"));
    assert.ok(link.props.rel.split(/\s+/).includes("noreferrer"));
    assert.ok(link.props.title);
    assert.ok(link.props["data-track"] && link.props["data-track-label"]);
    assert.match(link.props.className, /(?:^|\s)size-(?:\d+|\[[^\]]+\])(?:\s|$)/);
    assert.match(link.props.className, /(?:^|\s)hover:text-white(?:\s|$)/);
    assert.match(link.props.className, /focus-visible:outline-/);
    assert.match(link.props.className, /motion-reduce:transition-none/);
  }
  const html = renderFooter();
  const renderedSocial = html.match(/<nav aria-label="OutRay social links"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(renderedSocial);
  const icons = [...renderedSocial.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(icons.length, 2);
  for (const icon of icons) assert.match(icon, /aria-hidden="true"/);
  assert.match(textContent(footer), /© \d{4} OutRay\./);
  assert.doesNotMatch(html, /Built for the people on call\./);
  assert.equal((html.match(new RegExp(`href="${props.githubUrl}"`, "g")) ?? []).length, 1);
});
