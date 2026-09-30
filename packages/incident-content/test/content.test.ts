import assert from "node:assert/strict";
import test from "node:test";
import { incidentPlainText, legacyIncidentDocument, parseIncidentDocument, renderIncidentHtml } from "../src/index";

const body = { type: "doc", content: [
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Update" }] },
  { type: "paragraph", content: [{ type: "text", text: "We are ", marks: [{ type: "bold" }] }, { type: "text", text: "recovering", marks: [{ type: "link", attrs: { href: "https://outray.dev/help" } }] }] },
  { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "API" }] }] }] },
] };

test("canonical rich text round-trips with derived plain text", () => {
  const parsed = parseIncidentDocument(body);
  assert.ok(parsed);
  assert.equal(parsed.note, "Update\nWe are recovering\nAPI");
  assert.equal(incidentPlainText(parsed.body), parsed.note);
  assert.match(renderIncidentHtml(parsed.body, "fallback"), /<h2>Update<\/h2>/);
  assert.match(renderIncidentHtml(parsed.body, "fallback"), /<a href="https:\/\/outray.dev\/help"/);
});

test("rejects scripts, unsupported nodes, malformed documents and unsafe links", () => {
  for (const candidate of [
    { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com" } }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "unsafe", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "unsafe", marks: [{ type: "link", attrs: { href: "data:text/html,hi" } }] }] }] },
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", extra: true }] }] },
    { type: "doc", content: [] },
  ]) assert.equal(parseIncidentDocument(candidate), null);
});

test("legacy text and malformed saved JSON render as escaped paragraphs", () => {
  const note = "A <script>alert(1)</script>\nSecond line";
  assert.equal(incidentPlainText(legacyIncidentDocument(note)), note);
  assert.equal(renderIncidentHtml(null, note), "<p>A &lt;script&gt;alert(1)&lt;/script&gt;</p><p>Second line</p>");
  assert.equal(renderIncidentHtml({ type: "doc", content: [{ type: "image" }] }, note), renderIncidentHtml(null, note));
});
