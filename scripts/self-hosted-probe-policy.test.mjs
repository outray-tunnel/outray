import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createProbePolicy, specialUseProbeRanges } from "./self-hosted-probe-policy.mjs";

const config = { networkName: "outray-self-hosted_probe", bridgeName: "br-outray-prb", subnet: "172.30.41.0/29", address: "172.30.41.2", gateway: "172.30.41.1", resolver: "1.1.1.1", postgresIp: "172.30.42.3", blockedHostAddresses: ["8.8.4.4", "93.184.216.0/24", "2001:4860::1"] };
const labels = { "com.outray.probe.instance": "console.example.net" };
const network = (p) => ({ Name: p.probeNetwork, Driver: "bridge", Internal: false, EnableIPv6: false, IPAM: { Config: [{ Subnet: p.probeSubnet, Gateway: p.probeGateway }] }, Options: { "com.docker.network.bridge.name": p.probeBridge, "com.docker.network.enable_ipv6": "false" }, Labels: labels, Containers: {} });

function firewall() {
  const calls = [], chains = new Map(), hooks = new Map(), drops = { v4: 0, v6: 0 };
  const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  const spawn = (binary, args, options) => {
    assert.equal(options.timeout, 10000);
    if (binary === "nsenter") { assert.deepEqual(args.slice(0, 4), ["--target", "4321", "--net", "--"]); binary = args[4]; args = args.slice(5); }
    calls.push({ binary, args });
    assert.ok(["iptables", "ip6tables"].includes(binary));
    assert.deepEqual(args.slice(0, 2), ["-w", "5"]); args = args.slice(2);
    const [operation, chain, ...values] = args, key = `${binary}:${chain}`;
    if (operation === "-S") {
      if (chains.has(key)) return ok([`-N ${chain}`, ...chains.get(key)].join("\n"));
      if (["DOCKER-USER", "INPUT", "FORWARD", "OUTPUT"].includes(chain)) return ok([`-P ${chain} ACCEPT`, ...(hooks.get(key) || [])].join("\n"));
      return { status: 1, stdout: "", stderr: "private diagnostics" };
    }
    if (operation === "-N") { assert.ok(!chains.has(key)); chains.set(key, []); return ok(); }
    if (operation === "-A") { assert.ok(chains.has(key)); chains.get(key).push(args.join(" ")); return ok(); }
    if (operation === "-C") return (hooks.get(key) || []).includes(["-A", chain, ...values].join(" ")) ? ok() : { status: 1, stdout: "", stderr: "missing" };
    if (operation === "-I") { assert.equal(values[0], "1"); hooks.set(key, [["-A", chain, ...values.slice(1)].join(" "), ...(hooks.get(key) || [])]); return ok(); }
    if (operation === "-n") return ok(`pkts bytes target\n${drops[binary === "ip6tables" ? "v6" : "v4"]} 0 DROP all -- * * 0.0.0.0/0 0.0.0.0/0`);
    assert.fail(`Unexpected firewall operation ${operation}`);
  };
  return { spawn, calls, chains, hooks, drops };
}

test("policy configuration rejects unsafe endpoints, CIDRs and command inputs", () => {
  for (const change of [{ networkName: "bad;network" }, { bridgeName: "bridge-name-too-long" }, { address: config.gateway }, { gateway: "172.30.41.9" }, { postgresIp: "8.8.8.8" }, { postgresIp: config.address }, { resolver: "127.0.0.1" }, { resolver: "8.8.4.4" }, { subnet: "8.8.8.0/29" }, { subnet: "172.30.41.1/29" }, { blockedHostAddresses: ["93.184.216.2/24"] }, { blockedHostAddresses: ["invalid"] }, { blockedHostAddresses: ["8.0.0.0/08"] }, { unexpected: true }]) assert.throws(() => createProbePolicy({ ...config, ...change }));
  assert.throws(() => createProbePolicy({ ...config, blockedHostAddresses: undefined }));
  const p = createProbePolicy(config);
  assert.ok(p.deniedProbeRanges.includes("8.8.4.4/32")); assert.ok(p.deniedProbeRanges.includes("93.184.216.0/24"));
});

test("policy identities are deterministic per configuration and have no installation-specific names", async () => {
  const first = createProbePolicy(config), same = createProbePolicy({ ...config, blockedHostAddresses: [...config.blockedHostAddresses].reverse() });
  assert.deepEqual(first.chains, same.chains);
  assert.notDeepEqual(first.chains, createProbePolicy({ ...config, postgresIp: "10.4.5.6" }).chains);
  for (const chain of Object.values(first.chains)) assert.ok(chain.length < 29);
  const source = await readFile(new URL("./self-hosted-probe-policy.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /OR_OPS|outray-ops|209\.74\.|systemctl|writeFile|--flush/);
});

test("dedicated bridge ownership and subnet collisions fail closed", async () => {
  const p = createProbePolicy(config), current = new Map(), calls = [];
  assert.equal(p.probeNetworkArguments(labels).at(-1), config.networkName);
  await p.ensureProbeNetwork({ labels, inspect: async () => current.get("network"), required: async (args) => { calls.push(args); current.set("network", network(p)); } });
  assert.equal(calls.length, 1); assert.ok(p.safeProbeNetwork(network(p), labels));
  assert.ok(!p.safeProbeNetwork({ ...network(p), Containers: { foreign: { IPv4Address: "172.30.41.3/29" } } }, labels));
  p.assertProbeNetworkCollisions({ networks: [], routes: [{ dst: "172.30.40.0/24", dev: "other" }], interfaces: [], labels });
  for (const change of [{ networks: [{ Name: "foreign", IPAM: { Config: [{ Subnet: "172.30.0.0/16" }] } }] }, { routes: [{ dst: "172.30.41.0/29", dev: "foreign" }] }, { interfaces: [{ ifname: config.bridgeName }] }]) assert.throws(() => p.assertProbeNetworkCollisions({ networks: [], routes: [], interfaces: [], labels, ...change }));
  assert.throws(() => p.probeNetworkArguments({ "bad_label": "value" }));
});

test("host policy admits only exact Pg, resolver DNS, and public web traffic", () => {
  const p = createProbePolicy(config), policy = p.hostProbePolicy(), rules = policy[0].rules;
  assert.ok(rules[0].includes("!")); assert.ok(rules[1].includes(`${config.postgresIp}/32`)); assert.ok(rules[1].includes("5432"));
  for (const range of [...specialUseProbeRanges, "8.8.4.4/32", "93.184.216.0/24"]) assert.ok(rules.some((rule) => rule.includes(range) && rule.at(-1) === "DROP"));
  assert.equal(rules.filter((rule) => rule.at(-1) === "ACCEPT").length, 5);
  assert.equal(rules.at(-1).at(-1), "DROP"); assert.deepEqual(policy[0].hooks, [["DOCKER-USER", "-i", config.bridgeName]]);
  assert.ok(policy[2].rules.every((rule) => rule.at(-1) === "DROP"));
});

test("namespace allows only exact embedded DNS tuples, never generic loopback or established bypass", () => {
  const p = createProbePolicy(config), rules = p.namespaceProbePolicy()[0].rules;
  for (const rule of rules.slice(0, 2)) { assert.ok(rule.includes("127.0.0.11/32")); assert.ok(rule.includes("--ctorigdstport")); assert.ok(rule.includes("53")); assert.ok(!rule.includes("--dport")); }
  for (const rule of rules.filter((row) => row.includes("ESTABLISHED"))) { assert.ok(rule.includes("--ctdir")); assert.ok(rule.includes("REPLY")); assert.ok(rule.includes("--ctorigdstport")); }
  assert.equal(p.namespaceProbePolicy()[1].rules[0].at(-1), "DROP");
  for (const pid of [0, 1, "4321", 1.5]) assert.throws(() => p.installProbeNamespace({ pid, spawn: () => assert.fail("must not execute") }));
});

test("installation is idempotent and never flushes or modifies unrelated chains", () => {
  const p = createProbePolicy(config), f = firewall();
  p.installProbeHostPolicy({ spawn: f.spawn }); p.verifyProbeHostPolicy({ spawn: f.spawn });
  p.installProbeNamespace({ pid: 4321, spawn: f.spawn }); p.verifyProbeNamespace({ pid: 4321, spawn: f.spawn });
  const count = f.chains.size; p.installProbeHostPolicy({ spawn: f.spawn }); assert.equal(f.chains.size, count);
  for (const call of f.calls) for (const forbidden of ["-F", "-X", "-P", "-D", "--flush"]) assert.ok(!call.args.includes(forbidden));
  f.hooks.set("iptables:OUTPUT", ["-A OUTPUT -j ACCEPT", ...f.hooks.get("iptables:OUTPUT")]);
  assert.throws(() => p.verifyProbeNamespace({ pid: 4321, spawn: f.spawn }));
});

test("connectivity acceptance requires allowed access AND actual IPv4/IPv6 DROP increments", async () => {
  const p = createProbePolicy(config), f = firewall(); p.installProbeHostPolicy({ spawn: f.spawn }); p.installProbeNamespace({ pid: 4321, spawn: f.spawn });
  const options = { containerId: "a".repeat(64), pid: 4321, spawn: f.spawn, required: async (args) => {
    const code = args.at(-1); if (code.includes("allowed-network-ok")) return "allowed-network-ok";
    f.drops[code.includes('host:"::1"') ? "v6" : "v4"]++; return "";
  } };
  assert.equal((await p.verifyProbeConnectivity(options)).denialCountersVerified, p.blockedProbeChecks.length);
  await assert.rejects(p.verifyProbeConnectivity({ ...options, required: async (args) => args.at(-1).includes("allowed-network-ok") ? "allowed-network-ok" : "" }));
  assert.doesNotMatch(p.connectivityAuditCode(), /rejectUnauthorized|DATABASE_URL|PASSWORD/);
  assert.ok(p.blockedProbeChecks.some(([ip]) => ip === "93.184.216.1"));
});
