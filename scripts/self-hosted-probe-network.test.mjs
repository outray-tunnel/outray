import assert from "node:assert/strict";
import test from "node:test";
import { blockedProbeChecks, connectivityAuditCode, deniedProbeRanges, ensureProbeNetwork, hostProbePolicy, installProbeHostPolicy, installProbeNamespace, namespaceProbePolicy,
  probeAddress, probeBridge, probeGateway, probeNetwork, probeNetworkArguments, probePolicyUnitText, probeResolver, probeSubnet,
  safeProbeNetwork, verifyProbeHostPolicy, verifyProbeNamespace } from "./self-hosted-probe-network.mjs";

const pg = "172.18.0.2", labels = { "com.outray.probe.managed": "true", "com.outray.probe.instance": "ops.outray.dev" };
const network = () => ({ Driver: "bridge", Internal: false, EnableIPv6: false,
  Options: { "com.docker.network.bridge.name": probeBridge, "com.docker.network.enable_ipv6": "false" },
  IPAM: { Config: [{ Subnet: probeSubnet, Gateway: probeGateway }] }, Labels: labels, Containers: {} });

function fakeFirewall({ failAt, drift = false } = {}) {
  const calls = [], chains = new Map(), hooks = new Map(), success = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  const spawn = (binary, original, config) => {
    assert.ok(config.timeout <= 10000);
    let args = original;
    if (binary === "nsenter") {
      assert.deepEqual(args.slice(0, 4), ["--target", "4321", "--net", "--"]);
      binary = args[4]; args = args.slice(5);
    }
    calls.push({ binary, args });
    if (calls.length === failAt) return { status: 1, stdout: "private-value", stderr: "private-value" };
    assert.ok(["iptables", "ip6tables"].includes(binary));
    assert.deepEqual(args.slice(0, 2), ["-w", "5"]); args = args.slice(2);
    const [operation, chain, ...values] = args, key = `${binary}:${chain}`;
    if (operation === "-S") {
      if (chains.has(key)) return success([`-N ${chain}`, ...chains.get(key)].join("\n") + (drift ? "\n-A changed -j ACCEPT" : ""));
      if (["DOCKER-USER", "INPUT", "FORWARD", "OUTPUT"].includes(chain)) return success([`-P ${chain} ACCEPT`, ...(hooks.get(key) || [])].join("\n"));
      return { status: 1, stdout: "", stderr: "no chain" };
    }
    if (operation === "-N") { assert.ok(!chains.has(key)); chains.set(key, []); return success(); }
    if (operation === "-A") { assert.ok(chains.has(key)); chains.get(key).push(args.join(" ")); return success(); }
    if (operation === "-C") {
      const line = ["-A", chain, ...values].join(" ");
      return (hooks.get(key) || []).includes(line) ? success() : { status: 1, stdout: "", stderr: "missing" };
    }
    if (operation === "-I") {
      assert.equal(values[0], "1");
      const line = ["-A", chain, ...values.slice(1)].join(" ");
      hooks.set(key, [line, ...(hooks.get(key) || [])]); return success();
    }
    assert.fail(`Unrecognized operation ${operation}`);
  };
  return { spawn, calls, chains, hooks };
}

test("probe bridge has a fixed isolated address and no core-network joins", () => {
  const args = probeNetworkArguments(labels);
  assert.equal(args.at(-1), probeNetwork);
  assert.equal(args[args.indexOf("--subnet") + 1], probeSubnet);
  assert.ok(args.includes(`com.docker.network.bridge.name=${probeBridge}`));
  assert.ok(args.includes("com.docker.network.enable_ipv6=false"));
  assert.ok(!args.includes("--internal"));
  assert.equal(safeProbeNetwork(network(), labels), true);
  for (const change of [{ Internal: true }, { EnableIPv6: true }, { Driver: "host" }, { Labels: {} }, { IPAM: { Config: [{ Subnet: "172.18.0.0/16", Gateway: "172.18.0.1" }] } }, { Containers: { other: { IPv4Address: `${probeAddress}/29` } } }]) assert.equal(safeProbeNetwork({ ...network(), ...change }, labels), false);
  assert.equal(safeProbeNetwork({ ...network(), Containers: { exact: { IPv4Address: `${probeAddress}/29` } } }, labels, "exact"), true);
});

test("network setup refuses foreign/drifted networks and only creates its exact named bridge", async () => {
  const calls = [], current = new Map();
  await ensureProbeNetwork({ labels, inspect: () => current.get("network") || null, required: (args) => { calls.push(args); current.set("network", network()); } });
  assert.deepEqual(calls, [probeNetworkArguments(labels)]);
  await ensureProbeNetwork({ labels, inspect: () => network(), required: () => assert.fail("must reuse") });
  await assert.rejects(ensureProbeNetwork({ labels, inspect: () => ({ ...network(), Labels: {} }), required: () => assert.fail("must refuse") }));
});

test("host forwarding admits exact private Pg, then denies special/host ranges and all other ports", () => {
  const policy = hostProbePolicy(pg), rules = policy[0].rules;
  assert.deepEqual(policy[0].hooks, [["DOCKER-USER", "-i", probeBridge]]);
  assert.deepEqual(rules[0].slice(2), ["!", "-s", `${probeAddress}/32`, "-j", "DROP"]);
  assert.equal(rules[1].join(" "), `-A OR_OPS_PROBE_OUT -d ${pg}/32 -p tcp -m tcp --dport 5432 -j ACCEPT`);
  for (const range of deniedProbeRanges) assert.ok(rules.some((r) => r.join(" ") === `-A OR_OPS_PROBE_OUT -d ${range} -j DROP`));
  assert.ok(deniedProbeRanges.includes("169.254.0.0/16")); assert.ok(deniedProbeRanges.includes("209.74.86.0/24"));
  assert.ok(rules.some((r) => r.includes(`${probeResolver}/32`) && r.includes("udp") && r.includes("53")));
  const accept = rules.filter((r) => r.at(-1) === "ACCEPT"); assert.equal(accept.length, 5);
  assert.deepEqual(rules.at(-1).slice(-2), ["-j", "DROP"]);
  assert.equal(policy[1].rules.length, 1); assert.equal(policy[1].rules[0].at(-1), "DROP");
  assert.deepEqual(policy[2].hooks, [["INPUT", "-i", probeBridge], ["FORWARD", "-i", probeBridge]]);
});

test("namespace permits only original Docker DNS tuple, no generic loopback or established bypass", () => {
  const policy = namespaceProbePolicy(pg), rules = policy[0].rules;
  for (const r of rules.slice(0, 2)) {
    assert.ok(r.includes("127.0.0.11/32")); assert.ok(r.includes("--ctorigdst")); assert.ok(r.includes("--ctorigdstport")); assert.ok(r.includes("53"));
    assert.ok(!r.includes("--dport"), "Docker DNS DNAT uses an ephemeral listener port");
  }
  assert.ok(rules.some((r) => r.includes("127.0.0.0/8") && r.at(-1) === "DROP"));
  for (const r of rules.filter((item) => item.includes("ESTABLISHED"))) {
    assert.ok(r.includes("--ctdir") && r.includes("REPLY")); assert.ok(r.includes("--ctorigdst") && r.includes("127.0.0.11") && r.includes("--ctorigdstport") && r.includes("53"));
    assert.match(r.join(" "), /--ctstate ESTABLISHED --ctorigdst 127\.0\.0\.11 --ctorigdstport 53 --ctdir REPLY -j ACCEPT$/, "match the real iptables -S conntrack option order");
  }
  assert.deepEqual(policy[0].hooks, [["OUTPUT"]]);
  assert.equal(policy[1].rules.length, 1); assert.equal(policy[1].rules[0].at(-1), "DROP");
  for (const invalid of ["10.0.0.1", "172.18.0.1", "172.18.0.0", "172.18.999.1", "172.18.01.2", "209.74.85.181", "172.18.0.2;cmd", "::1"]) {
    assert.throws(() => hostProbePolicy(invalid)); assert.throws(() => namespaceProbePolicy(invalid));
  }
});

test("host installation preserves unrelated chains/policies and reuses exact owned rules idempotently", () => {
  const f = fakeFirewall(); installProbeHostPolicy({ postgresIp: pg, spawn: f.spawn }); verifyProbeHostPolicy({ postgresIp: pg, spawn: f.spawn });
  const originalRules = JSON.stringify([...f.chains]); installProbeHostPolicy({ postgresIp: pg, spawn: f.spawn });
  assert.equal(JSON.stringify([...f.chains]), originalRules);
  for (const call of f.calls) for (const forbidden of ["-F", "--flush", "-X", "-P", "-D"]) assert.ok(!call.args.includes(forbidden));
  assert.equal(f.calls.find((c) => c.args.includes("-N")).args.at(-1), "OR_OPS_PROBE_IN", "host guard precedes outbound permit");
});

test("namespace installation uses exact PID namespace, IPv6 deny, scoped OUTPUT and fails on drift", () => {
  const f = fakeFirewall(); installProbeNamespace({ pid: 4321, postgresIp: pg, spawn: f.spawn }); verifyProbeNamespace({ pid: 4321, postgresIp: pg, spawn: f.spawn });
  assert.ok(f.chains.has("ip6tables:OR_OPS_PROBE_NS6"));
  f.hooks.set("iptables:OUTPUT", ["-A OUTPUT -j ACCEPT", ...f.hooks.get("iptables:OUTPUT")]);
  assert.throws(() => verifyProbeNamespace({ pid: 4321, postgresIp: pg, spawn: f.spawn }));
  for (const pid of [0, 1, "4321", 1.1, NaN]) assert.throws(() => installProbeNamespace({ pid, postgresIp: pg, spawn: () => assert.fail("invalid PID") }));
  assert.throws(() => installProbeHostPolicy({ postgresIp: pg, spawn: fakeFirewall({ drift: true }).spawn }));
});

test("failed firewall operations suppress raw diagnostics and do not allow worker startup", () => {
  assert.throws(() => installProbeHostPolicy({ postgresIp: pg, spawn: fakeFirewall({ failAt: 2 }).spawn }), (error) => !error.message.includes("private-value"));
});

test("boot persistence is secret-free, scoped to this helper and precedes the guarded worker", () => {
  const text = probePolicyUnitText(pg);
  assert.match(text, /After=docker\.service/); assert.match(text, /Before=outray-ops-uptime-probe\.service/);
  assert.match(text, /--restore --postgres-ip 172\.18\.0\.2/); assert.match(text, /NoNewPrivileges=yes/);
  assert.match(text, /ExecStart=\/usr\/local\/bin\/node \/opt\/outray-ops\/source\/scripts\/self-hosted-probe-network\.mjs/);
  assert.ok(!text.includes("ExecStart=/usr/bin/node"));
  for (const secret of ["instance.env", "DATABASE_URL", "POSTGRES_PASSWORD", ".env.prod"]) assert.ok(!text.includes(secret));
  assert.throws(() => probePolicyUnitText(pg, "/other/script.mjs"));
});

test("real execution acceptance requires DNS, certified public HTTPS, Pg-only and exact blocked sockets", () => {
  const code = connectivityAuditCode(pg);
  assert.match(code, /resolve4\('example.com'\)/); assert.match(code, /setServers\(\['1.1.1.1'\]\)/);
  assert.match(code, /https.get\('https:\/\/example.com\//); assert.match(code, /172\.18\.0\.2',5432/);
  assert.ok(!code.includes("rejectUnauthorized")); assert.ok(!code.includes("password"));
  for (const host of ["169.254.169.254", "127.0.0.1", "127.0.0.11", "172.18.0.4", "209.74.86.89", "8.8.8.8", "::1"]) assert.ok(blockedProbeChecks.some(([candidate]) => candidate === host));
});
