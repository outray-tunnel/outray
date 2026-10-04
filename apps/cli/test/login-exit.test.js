"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");

const cliPath = path.join(__dirname, "..", "dist", "index.js");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address());
    });
  });
}

function createBrowserStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "outray-browser-"));
  const pidFile = path.join(dir, "browser.pid");
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const script = `#!/bin/sh
echo $$ > ${JSON.stringify(pidFile)}
sleep 60
`;
  fs.writeFileSync(path.join(dir, command), script, { mode: 0o755 });
  return {
    pathDir: dir,
    cleanup() {
      try {
        const pid = Number(fs.readFileSync(pidFile, "utf8"));
        if (pid) {
          process.kill(pid, "SIGKILL");
        }
      } catch {
        // The stub may already have exited with the CLI.
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function createLoginServer(pendingPolls) {
  let polls = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (body) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };

    if (req.method === "POST" && url.pathname === "/api/cli/login") {
      send({
        loginUrl: "http://127.0.0.1/login",
        code: "code",
        expiresIn: 300,
      });
      return;
    }

    if (url.pathname === "/api/cli/login/status") {
      polls += 1;
      if (polls <= pendingPolls) {
        send({ status: "pending" });
        return;
      }
      send({ status: "authenticated", userToken: "user-token" });
      return;
    }

    if (url.pathname === "/api/me/orgs") {
      send([
        { id: "org1", slug: "acme", name: "Acme", role: "owner" },
      ]);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/cli/exchange") {
      req.resume();
      req.on("end", () => {
        send({
          orgToken: "org-token",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      });
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  return server;
}

function runCli(args, extraEnv) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "outray-home-"));
  const child = spawn(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  return {
    child,
    home,
    output: () => output,
    cleanup() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("process did not exit"));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test("login exits after success even if the browser process stays open", async () => {
  const server = createLoginServer(0);
  const browser = createBrowserStub();
  const address = await listen(server);
  const cli = runCli(["login"], {
    OUTRAY_WEB_URL: `http://127.0.0.1:${address.port}`,
    PATH: `${browser.pathDir}${path.delimiter}${process.env.PATH}`,
  });

  try {
    const code = await waitForExit(cli.child, 8000);
    assert.equal(code, 0);
    assert.match(cli.output(), /Logged in successfully/);
    assert.match(cli.output(), /Active org: acme/);
  } finally {
    cli.cleanup();
    browser.cleanup();
    server.close();
  }
});

test("login keeps polling until the browser session is authenticated", async () => {
  const server = createLoginServer(1);
  const browser = createBrowserStub();
  const address = await listen(server);
  const cli = runCli(["login"], {
    OUTRAY_WEB_URL: `http://127.0.0.1:${address.port}`,
    PATH: `${browser.pathDir}${path.delimiter}${process.env.PATH}`,
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(cli.child.exitCode, null);

    const code = await waitForExit(cli.child, 12000);
    assert.equal(code, 0);
    assert.match(cli.output(), /Logged in successfully/);
  } finally {
    cli.cleanup();
    browser.cleanup();
    server.close();
  }
});

test("an http tunnel stays running after startup", async () => {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => wss.once("listening", resolve));
  const address = wss.address();
  const cli = runCli(["8080", "--key", "test-key"], {
    OUTRAY_SERVER_URL: `ws://127.0.0.1:${address.port}`,
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(cli.child.exitCode, null);
    assert.match(cli.output(), /Connecting to OutRay/);
  } finally {
    cli.cleanup();
    await new Promise((resolve) => wss.close(() => resolve()));
  }
});
