const test = require("node:test");
const assert = require("node:assert/strict");
const { OutRayClient } = require("../dist/client.js");
const { TCPTunnelClient } = require("../dist/tcp-client.js");
const { UDPTunnelClient } = require("../dist/udp-client.js");

for (const Client of [OutRayClient, TCPTunnelClient, UDPTunnelClient]) {
  test(`${Client.name} defaults to connect.outray.co without starting a connection`, () => {
    assert.equal(new Client(3000).serverUrl, "wss://connect.outray.co/");
  });

  test(`${Client.name} retains explicit legacy and self-hosted endpoint overrides`, () => {
    for (const endpoint of ["wss://api.outray.dev/", "wss://tunnel.example.test/", "ws://localhost:3547"]) {
      assert.equal(new Client(3000, endpoint).serverUrl, endpoint);
    }
  });
}
