import assert from "node:assert/strict";
import test from "node:test";
import { createUsageHoverScheduler } from "../src/components/overview/usage-hover";

function setup() {
  const frames = new Map<number, () => void>();
  const inspected: (number | null)[] = [];
  let frameId = 0;
  const scheduler = createUsageHoverScheduler({
    requestFrame(callback) {
      const id = frameId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) { frames.delete(id); },
    onInspect(index) { inspected.push(index); },
  });
  const flush = () => {
    const scheduled = [...frames.values()];
    frames.clear();
    scheduled.forEach((callback) => callback());
  };
  return { scheduler, frames, inspected, flush };
}

test("crossing adjacent bars never flashes the aggregate between their values", () => {
  const { scheduler, inspected, frames, flush } = setup();
  scheduler.inspect(0);
  flush();
  scheduler.inspect(null); // Leave the previous SVG rectangle.
  scheduler.inspect(1); // Enter the adjacent rectangle before the next paint.
  assert.equal(frames.size, 1);
  flush();
  assert.deepEqual(inspected, [0, 1]);
});

test("rapid pointer moves commit only the latest inspected bar per frame", () => {
  const { scheduler, frames, inspected, flush } = setup();
  for (let index = 0; index < 14; index++) {
    scheduler.inspect(index);
    scheduler.inspect(index);
  }
  assert.equal(frames.size, 1);
  flush();
  assert.deepEqual(inspected, [13]);
  scheduler.inspect(2);
  flush();
  assert.deepEqual(inspected, [13, 2]);
});

test("resting in blank chart space restores the default on the next paint", () => {
  const { scheduler, inspected, flush } = setup();
  scheduler.inspect(3);
  flush();
  scheduler.inspect(null);
  flush();
  assert.deepEqual(inspected, [3, null]);
});

test("leave, blur, or keyboard inspection cancels pending hover before immediate reset", () => {
  const { scheduler, frames, inspected, flush } = setup();
  scheduler.inspect(7);
  assert.equal(frames.size, 1);
  scheduler.cancel();
  inspected.push(null); // Chart reset does not wait for the animation frame.
  assert.equal(frames.size, 0);
  flush();
  assert.deepEqual(inspected, [null]);
  scheduler.cancel(); // Cleanup is safe after a prior reset.
});

test("a cancelled scheduler remains usable with no stale queued selection", () => {
  const { scheduler, inspected, flush } = setup();
  scheduler.inspect(8);
  scheduler.cancel();
  scheduler.inspect(0);
  flush();
  assert.deepEqual(inspected, [0]);
});
