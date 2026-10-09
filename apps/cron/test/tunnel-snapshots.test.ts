import assert from "node:assert/strict";
import { test } from "node:test";
import { activeTunnelSnapshot } from "../src/lib/tinybird-tunnels";

test("active tunnel snapshots preserve minute dedup keys and zero counts", () => {
  const snapshot = activeTunnelSnapshot(new Date("2026-10-09T10:15:35.123Z"), 0);
  assert.deepEqual(snapshot, {
    ts: "2026-10-09 10:15:00.000", active_tunnels: 0, ingested_at: "2026-10-09 10:15:35.123",
  });
  assert.equal(activeTunnelSnapshot(new Date("2026-10-09T10:15:59.999Z"), 25).ts, snapshot.ts);
});
