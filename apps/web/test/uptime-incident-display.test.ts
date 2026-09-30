import assert from "node:assert/strict";
import test from "node:test";
import type { UptimeComponent, UptimeIncident, UptimeIncidentUpdate, UptimePageResponse } from "../src/components/uptime/uptime-client";
import { affectedComponentNames, incidentDuration, incidentLabel, incidentSearch, pageComponents, publishedIncidentUpdates } from "../src/lib/uptime/incident-display";

const incident: UptimeIncident = {
  id: "incident", title: "API errors", status: "open", sourceType: "uptime_manual",
  startedAt: "2026-09-30T10:00:00.000Z",
};
const update = (id: string, publishedAt: string | null, status: UptimeIncidentUpdate["status"] = "investigating"): UptimeIncidentUpdate => ({
  id, publishedAt, status, note: id, createdAt: "2026-09-30T09:00:00.000Z",
});
const component = (id: string, name: string, groupId: string | null = null): UptimeComponent => ({
  id, name, groupId, description: null, visible: true, sortOrder: 0, monitorIds: [], state: "unknown",
});

test("URL filters normalize defaults and invalid values without retaining unrelated parameters", () => {
  assert.deepEqual(incidentSearch({ q: "  API errors  ", view: "active", source: "manual", unrelated: true }), {
    q: "API errors", view: "active", source: "manual",
  });
  assert.deepEqual(incidentSearch({ q: 12, view: "all", source: "invalid" }), {});
  assert.deepEqual(incidentSearch({ view: "drafts", source: "automatic" }), { view: "drafts", source: "automatic" });
  assert.equal(incidentSearch({ q: "a".repeat(200) }).q?.length, 160);
});

test("unpublished update status never changes incident lifecycle or draft visibility", () => {
  const resolvingDraft = update("draft", null, "resolved");
  assert.equal(incidentLabel(incident, [resolvingDraft]), "Draft");
  assert.equal(incidentLabel(incident, [resolvingDraft, update("published", "2026-09-30T10:05:00Z")]), "Active");
  assert.equal(incidentLabel({ ...incident, status: "resolved" }, []), "Resolved");
  assert.equal(incidentLabel({ ...incident, sourceType: "uptime_monitor" }, []), "Active");
});

test("published timeline uses publication time, separates drafts, and does not mutate input", () => {
  const updates = [
    { ...update("older", "2026-09-30T10:00:00Z"), createdAt: "2026-09-30T09:30:00Z" },
    { ...update("later", "2026-09-30T10:30:00Z"), createdAt: "2026-09-30T09:00:00Z" },
    update("newest-draft", null),
  ];
  assert.deepEqual(publishedIncidentUpdates(updates).map((item) => item.id), ["later", "older"]);
  assert.deepEqual(updates.map((item) => item.id), ["older", "later", "newest-draft"]);
});

test("standalone and grouped component labels use current names with removed-component snapshots", () => {
  const standalone = component("standalone", "Public API");
  const grouped = component("grouped", "Checkout", "services");
  const page: UptimePageResponse = { page: null, standaloneComponents: [standalone], groups: [{
    id: "services", name: "Services", visible: true, sortOrder: 0, components: [grouped],
  }] };
  assert.deepEqual(pageComponents(page), [standalone, grouped]);
  assert.deepEqual(pageComponents(undefined), []);
  assert.deepEqual(affectedComponentNames({
    ...incident, componentIds: ["standalone", "grouped", "removed", "unknown"],
    sourceSnapshot: { affectedComponents: [{ id: "removed", name: "Legacy API" }, { id: "standalone", name: "Old name" }] },
  }, pageComponents(page)), ["Public API", "Checkout", "Legacy API", "Removed component"]);
  assert.deepEqual(affectedComponentNames({ ...incident, sourceSnapshot: { affectedComponents: [{ id: "removed", name: "Legacy API" }] } }, []), ["Legacy API"]);
});

test("incident duration respects resolution and advances with the refresh clock", () => {
  assert.equal(incidentDuration(incident, Date.parse("2026-09-30T10:00:59Z")), "Less than a minute");
  assert.equal(incidentDuration(incident, Date.parse("2026-09-30T11:13:00Z")), "1h 13m");
  assert.equal(incidentDuration({ ...incident, status: "resolved", resolvedAt: "2026-09-30T10:18:00Z" }, Date.parse("2026-10-01T10:00:00Z")), "18m");
  assert.equal(incidentDuration(incident, Date.parse("2026-10-02T11:00:00Z")), "2d 1h");
  assert.equal(incidentDuration({ ...incident, startedAt: undefined }), "—");
});
