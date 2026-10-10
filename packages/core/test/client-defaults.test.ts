import assert from "node:assert/strict";
import test from "node:test";
import { OutrayClient } from "../src/client";

function serverUrl(client: OutrayClient): string {
  return (client as unknown as { options: { serverUrl: string } }).options
    .serverUrl;
}

test("core tunnel clients default to connect.outray.co without starting a connection", () => {
  assert.equal(
    serverUrl(new OutrayClient({ localPort: 3000 })),
    "wss://connect.outray.co/",
  );
});

test("explicit tunnel servers retain legacy aliases and self-hosted URLs", () => {
  for (const endpoint of [
    "wss://api.outray.dev/",
    "wss://tunnel.example.test/",
    "ws://localhost:3547",
  ]) {
    assert.equal(
      serverUrl(new OutrayClient({ localPort: 3000, serverUrl: endpoint })),
      endpoint,
    );
  }
});
