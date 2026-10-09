import assert from "node:assert/strict";
import { test } from "node:test";
import { DurableQueue, queuePayloads } from "../../../shared/durable-queue";

function queue() {
  return new DurableQueue<{ id: number }>({
    signalName: "test", redisUrl: "redis://127.0.0.1:6379", streamKey: "stream",
    deadLetterKey: "dead-letter", group: "writers", maxEntries: 100,
    batchSize: 10, maxDeliveryAttempts: 1, async deliver() {},
  });
}

test("durable admission checks capacity and enqueues chunks in one Redis script", async () => {
  const instance = queue();
  let call: unknown[] = [];
  Object.defineProperty(instance, "producer", { value: {
    status: "ready", async eval(...args: unknown[]) { call = args; return 2; },
  } });
  await instance.enqueue(Array.from({ length: 251 }, (_, id) => ({ id })));
  assert.equal(call[1], 1);
  assert.equal(call[2], "stream");
  assert.equal(call[3], 100);
  assert.equal(call[4], 0);
  assert.equal(JSON.parse(String(call[5])).length, 250);
  assert.equal(JSON.parse(String(call[6])).length, 1);
  assert.match(String(call[0]), /XLEN/);
  assert.match(String(call[0]), /XADD/);
});

test("queue capacity and failed admissions propagate to the producer", async () => {
  const instance = queue();
  const producer = { status: "ready", async eval() { return 0; } };
  Object.defineProperty(instance, "producer", { value: producer });
  await assert.rejects(instance.enqueue([{ id: 1 }]), /queue is full/);
  producer.eval = async () => { throw new Error("redis unavailable"); };
  await assert.rejects(instance.enqueue([{ id: 1 }]), /redis unavailable/);
});

test("dead-letter storage precedes acknowledging the source and failures propagate", async (context) => {
  context.mock.method(console, "error", () => undefined);
  const instance = queue();
  let call: unknown[] = [];
  Object.defineProperty(instance, "worker", { value: {
    async eval(...args: unknown[]) { call = args; throw new Error("redis full"); },
  } });
  const internal = instance as unknown as {
    deadLetter(id: string, payload: string, error: unknown): Promise<void>;
  };
  await assert.rejects(internal.deadLetter("1-0", "private payload", new Error("delivery failed")), /redis full/);
  const script = String(call[0]);
  assert.ok(script.indexOf("XADD") < script.indexOf("XACK"));
  assert.ok(script.indexOf("XACK") < script.indexOf("XDEL"));
  assert.deepEqual(call.slice(1), [2, "stream", "dead-letter", "writers", "1-0", "delivery failed", "private payload", 0, 1_000]);
});

test("Redis messages split by serialized UTF-8 bytes and bound individual records", () => {
  const records = [{ id: 1, body: "🦊".repeat(10) }, { id: 2, body: "x".repeat(60) }];
  const payloads = queuePayloads(records, 100);
  assert.equal(payloads.length, 2);
  assert.ok(payloads.every((payload) => Buffer.byteLength(payload) <= 100));
  assert.deepEqual(payloads.flatMap((payload) => JSON.parse(payload)), records);
  assert.throws(() => queuePayloads([{ body: "x".repeat(100) }], 100), /size limit/);
});

test("capture queues pass expiry bounds into admission and prune on worker maintenance", async () => {
  const instance = new DurableQueue<{ id: number }>({
    signalName: "capture", redisUrl: "redis://127.0.0.1:6379", streamKey: "stream",
    deadLetterKey: "dead-letter", group: "writers", maxEntries: 64,
    batchSize: 1, maxDeliveryAttempts: 1, maxAgeSeconds: 259_200, maxMessageBytes: 100,
    async deliver() {},
  });
  let enqueue: unknown[] = [];
  let prune: unknown[] = [];
  Object.defineProperty(instance, "producer", { value: { status: "ready", async eval(...args: unknown[]) { enqueue = args; return 1; } } });
  Object.defineProperty(instance, "worker", { value: { async eval(...args: unknown[]) { prune = args; return 1; } } });
  await instance.enqueue([{ id: 1 }]);
  assert.equal(enqueue[4], 259_200);
  assert.match(String(enqueue[0]), /XTRIM.*MINID/);
  assert.match(String(enqueue[0]), /EXPIRE/);
  await (instance as unknown as { pruneExpired(): Promise<void> }).pruneExpired();
  assert.deepEqual(prune.slice(1), [2, "stream", "dead-letter", 259_200]);
  assert.match(String(prune[0]), /TTL.*== -1/);
});
