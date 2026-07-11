import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import type { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { Server as SocketIOServer } from "socket.io";
import { OutrayClient } from "./client";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind server"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

test("OutrayClient forwards websocket upgrades to a plain websocket backend", async () => {
  let connected = false;

  const backendHttpServer = http.createServer();
  const backend = new WebSocketServer({ server: backendHttpServer });
  backend.on("connection", (socket) => {
    connected = true;
    socket.close();
  });
  const backendPort = await listen(backendHttpServer);

  const controlHttpServer = http.createServer();
  const controlServer = new WebSocketServer({ server: controlHttpServer });
  const controlPort = await listen(controlHttpServer);

  const client = new OutrayClient({
    localPort: backendPort,
    serverUrl: `ws://127.0.0.1:${controlPort}`,
  });

  const upgradeSeen = new Promise<void>((resolve, reject) => {
    controlServer.on("connection", (controlSocket) => {
      controlSocket.once("message", (raw) => {
        const openTunnel = JSON.parse(raw.toString()) as { type: string };
        assert.equal(openTunnel.type, "open_tunnel");
        controlSocket.send(JSON.stringify({ type: "tunnel_opened", url: "http://localhost.direct/test" }));

        controlSocket.once("message", (upgradeRaw) => {
          const upgrade = JSON.parse(upgradeRaw.toString()) as { type: string; success?: boolean };
          if (upgrade.type === "ws_upgrade_response" && upgrade.success) {
            resolve();
          } else {
            reject(new Error(`Unexpected upgrade response: ${upgradeRaw.toString()}`));
          }
        });

        controlSocket.send(JSON.stringify({
          type: "ws_upgrade",
          wsConnectionId: "wsc-test-plain",
          path: "/socket.io/?EIO=4&transport=websocket",
          headers: {
            origin: "https://frontend.example",
            "user-agent": "Mozilla/5.0",
          },
        }));
      });
    });
  });

  client.start();
  await upgradeSeen;

  assert.equal(connected, true);

  client.stop();
  await close(controlHttpServer);
  await close(backendHttpServer);
});

test("OutrayClient forwards origin so a Socket.IO backend can accept the websocket upgrade", async () => {
  let upgradeOrigin: string | undefined;
  let allowed = false;

  const ioServer = new SocketIOServer({
    cors: {
      origin: "https://frontend.example",
      credentials: true,
    },
    allowRequest: (req: IncomingMessage, callback: (err: string | null, success: boolean) => void) => {
      upgradeOrigin = req.headers.origin;
      allowed = req.headers.origin === "https://frontend.example";
      callback(null, allowed);
    },
  });

  const ioHttpServer = http.createServer();
  ioServer.attach(ioHttpServer);
  const backendPort = await listen(ioHttpServer);

  const controlHttpServer = http.createServer();
  const controlServer = new WebSocketServer({ server: controlHttpServer });
  const controlPort = await listen(controlHttpServer);

  const client = new OutrayClient({
    localPort: backendPort,
    serverUrl: `ws://127.0.0.1:${controlPort}`,
  });

  const upgradeSeen = new Promise<void>((resolve, reject) => {
    controlServer.on("connection", (controlSocket) => {
      controlSocket.once("message", (raw) => {
        const openTunnel = JSON.parse(raw.toString()) as { type: string };
        assert.equal(openTunnel.type, "open_tunnel");
        controlSocket.send(JSON.stringify({ type: "tunnel_opened", url: "http://localhost.direct/test" }));

        controlSocket.once("message", (upgradeRaw) => {
          const upgrade = JSON.parse(upgradeRaw.toString()) as { type: string; success?: boolean; error?: string };
          if (upgrade.type === "ws_upgrade_response" && upgrade.success) {
            resolve();
          } else {
            reject(new Error(`Unexpected upgrade response: ${upgradeRaw.toString()}`));
          }
        });

        controlSocket.send(JSON.stringify({
          type: "ws_upgrade",
          wsConnectionId: "wsc-test-socketio",
          path: "/socket.io/?EIO=4&transport=websocket",
          headers: {
            origin: "https://frontend.example",
            cookie: "session=abc123",
            "user-agent": "Mozilla/5.0",
          },
        }));
      });
    });
  });

  try {
    client.start();
    await upgradeSeen;

    assert.equal(upgradeOrigin, "https://frontend.example");
    assert.equal(allowed, true);
  } finally {
    client.stop();
    ioServer.close();
    await close(ioHttpServer);
    await close(controlHttpServer);
  }
});
