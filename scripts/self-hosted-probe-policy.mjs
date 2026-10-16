// Generic fail-closed probe policy. No global flush, persistence or unit writes.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { isIP } from "node:net";

export const specialUseProbeRanges = Object.freeze(["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"]);
const hostEnvironment = { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" };
const failure = () => { throw new Error("Probe isolation verification failed; unrelated rules/services are retained and private diagnostics suppressed."); };
const numeric = (address) => address.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
const privateIp = (address) => isIP(address) === 4 && (address.startsWith("10.") || address.startsWith("192.168.") || address.startsWith("172.") && Number(address.split(".")[1]) >= 16 && Number(address.split(".")[1]) <= 31);

function bounds(value) {
  const match = /^([^/]+)(?:\/(\d{1,2}))?$/.exec(value || "");
  if (!match || isIP(match[1]) !== 4 || Number(match[2] ?? 32) > 32 || match[2] !== undefined && String(Number(match[2])) !== match[2]) failure();
  const prefix = Number(match[2] ?? 32), size = 2 ** (32 - prefix), start = Math.floor(numeric(match[1]) / size) * size;
  return { start, end: start + size - 1, prefix, address: match[1] };
}

function checkedLabels(labels) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels) || !Object.keys(labels).length || Object.entries(labels).some(([key, value]) => !/^[a-z0-9][a-z0-9.-]{0,127}$/.test(key) || typeof value !== "string" || !value || value.length > 512 || /[\r\n\0]/.test(value))) failure();
  return labels;
}

function executor({ spawn = spawnSync, env = hostEnvironment, pid } = {}) {
  if (typeof spawn !== "function" || pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 1)) failure();
  return (binary, args, optional = false) => {
    const command = pid ? ["nsenter", ["--target", String(pid), "--net", "--", binary, ...args]] : [binary, args];
    const result = spawn(command[0], command[1], { env: { ...env, ...hostEnvironment }, encoding: "utf8", timeout: 10_000, maxBuffer: 500_000 });
    if (!result || typeof result.status !== "number" || result.status !== 0 && !optional) failure();
    return result;
  };
}

const normalizedRules = (text) => String(text).trim().replaceAll('"', "");
const hookArguments = (definition, hook) => [...hook, "-j", definition.chain];
const expectedChain = (definition) => [`-N ${definition.chain}`, ...definition.rules.map((args) => args.join(" "))].join("\n");

function assertPolicy(execute, policy) {
  for (const definition of policy) {
    if (normalizedRules(execute(definition.binary, ["-w", "5", "-S", definition.chain]).stdout) !== expectedChain(definition)) failure();
    for (const hook of definition.hooks) {
      const lines = normalizedRules(execute(definition.binary, ["-w", "5", "-S", hook[0]]).stdout).split("\n");
      const expected = policy.filter((item) => item.binary === definition.binary).flatMap((item) => item.hooks.filter((value) => value[0] === hook[0]).map((value) => ["-A", ...hookArguments(item, value)].join(" ")));
      const target = ["-A", ...hookArguments(definition, hook)].join(" ");
      const first = lines.filter((line) => line.startsWith(`-A ${hook[0]} `)).slice(0, expected.length);
      if (lines.filter((line) => line === target).length !== 1 || JSON.stringify(first.sort()) !== JSON.stringify(expected.sort())) failure();
    }
  }
}

function applyPolicy(execute, policy) {
  for (const definition of policy) {
    const existing = execute(definition.binary, ["-w", "5", "-S", definition.chain], true);
    if (existing.status === 0) {
      if (normalizedRules(existing.stdout) !== expectedChain(definition)) failure();
    } else {
      execute(definition.binary, ["-w", "5", "-N", definition.chain]);
      for (const args of definition.rules) execute(definition.binary, ["-w", "5", ...args]);
    }
    for (const hook of definition.hooks) {
      const args = hookArguments(definition, hook);
      if (execute(definition.binary, ["-w", "5", "-C", ...args], true).status !== 0) execute(definition.binary, ["-w", "5", "-I", hook[0], "1", ...args.slice(1)]);
    }
  }
  assertPolicy(execute, policy);
}

/** All endpoints are explicit, inspected installation metadata; no host defaults. */
export function createProbePolicy(config) {
  const fields = ["networkName", "bridgeName", "subnet", "address", "gateway", "resolver", "postgresIp", "blockedHostAddresses"];
  if (!config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).some((key) => !fields.includes(key))) failure();
  const { networkName, bridgeName, subnet, address, gateway, resolver, postgresIp, blockedHostAddresses } = config;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(networkName || "") || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,14}$/.test(bridgeName || "")) failure();
  const range = bounds(subnet);
  if (range.prefix < 16 || range.prefix > 29 || numeric(range.address) !== range.start || !privateIp(range.address) || !privateIp(address) || !privateIp(gateway) || !privateIp(postgresIp)) failure();
  const inside = (ip) => numeric(ip) > range.start && numeric(ip) < range.end;
  if (!inside(address) || !inside(gateway) || address === gateway || numeric(postgresIp) >= range.start && numeric(postgresIp) <= range.end) failure();
  if (!Array.isArray(blockedHostAddresses) || blockedHostAddresses.length > 256) failure();
  const hostAddresses = [...new Set(blockedHostAddresses.map((value) => {
    if (typeof value !== "string" || value.includes("%")) failure();
    if (isIP(value) === 6) return value;
    const candidate = bounds(value);
    if (numeric(candidate.address) !== candidate.start) failure();
    return `${candidate.address}/${candidate.prefix}`;
  }))].sort();
  const denied = [...new Set([...specialUseProbeRanges, ...hostAddresses.filter((value) => isIP(value) !== 6)])];
  if (isIP(resolver) !== 4 || denied.some((cidr) => { const deniedRange = bounds(cidr); return numeric(resolver) >= deniedRange.start && numeric(resolver) <= deniedRange.end; })) failure();
  const digest = createHash("sha256").update(JSON.stringify({ networkName, bridgeName, subnet, address, gateway, resolver, postgresIp, hostAddresses })).digest("hex").slice(0, 10);
  const chains = Object.freeze(Object.fromEntries(["OUT", "IN", "V6", "NS", "NS6", "PGR"].map((suffix) => [suffix, `OR_PR_${digest}_${suffix}`])));
  const rule = (chain, ...args) => ["-A", chain, ...args];
  const tcp = (chain, ip, port) => rule(chain, "-d", `${ip}/32`, "-p", "tcp", "-m", "tcp", "--dport", String(port), "-j", "ACCEPT");
  const dns = (chain, embedded = false) => ["udp", "tcp"].map((protocol) => embedded
    ? rule(chain, "-d", "127.0.0.11/32", "-p", protocol, "-m", "conntrack", "--ctorigdst", "127.0.0.11", "--ctorigdstport", "53", "-j", "ACCEPT")
    : rule(chain, "-d", `${resolver}/32`, "-p", protocol, "-m", protocol, "--dport", "53", "-j", "ACCEPT"));
  const embeddedReplies = (chain) => ["udp", "tcp"].map((protocol) => rule(chain, "-p", protocol, "-m", "conntrack", "--ctstate", "ESTABLISHED", "--ctorigdst", "127.0.0.11", "--ctorigdstport", "53", "--ctdir", "REPLY", "-j", "ACCEPT"));
  const outbound = (chain) => [tcp(chain, postgresIp, 5432), ...denied.map((cidr) => rule(chain, "-d", cidr, "-j", "DROP")), ...dns(chain), ...[80, 443].map((port) => rule(chain, "-p", "tcp", "-m", "tcp", "--dport", String(port), "-j", "ACCEPT")), rule(chain, "-j", "DROP")];

  const hostProbePolicy = () => [
    { binary: "iptables", chain: chains.OUT, rules: [rule(chains.OUT, "!", "-s", `${address}/32`, "-j", "DROP"), ...outbound(chains.OUT)], hooks: [["DOCKER-USER", "-i", bridgeName]] },
    { binary: "iptables", chain: chains.IN, rules: [rule(chains.IN, "-j", "DROP")], hooks: [["INPUT", "-i", bridgeName]] },
    { binary: "ip6tables", chain: chains.V6, rules: [rule(chains.V6, "-j", "DROP")], hooks: [["INPUT", "-i", bridgeName], ["FORWARD", "-i", bridgeName]] },
    { binary: "iptables", chain: chains.PGR, rules: [rule(chains.PGR, "-s", `${postgresIp}/32`, "-d", `${address}/32`, "-p", "tcp", "-m", "tcp", "--sport", "5432", "-m", "conntrack", "--ctstate", "ESTABLISHED", "-j", "ACCEPT"), rule(chains.PGR, "-j", "DROP")], hooks: [["DOCKER-USER", "-s", `${postgresIp}/32`, "-d", `${address}/32`, "-p", "tcp", "-m", "tcp", "--sport", "5432", "-m", "conntrack", "--ctstate", "ESTABLISHED"]] },
  ];
  const namespaceProbePolicy = () => [
    { binary: "iptables", chain: chains.NS, rules: [...dns(chains.NS, true), ...embeddedReplies(chains.NS), ...outbound(chains.NS)], hooks: [["OUTPUT"]] },
    { binary: "ip6tables", chain: chains.NS6, rules: [rule(chains.NS6, "-j", "DROP")], hooks: [["OUTPUT"]] },
  ];
  const probeNetworkArguments = (labels) => ["network", "create", "--driver", "bridge", "--subnet", subnet, "--gateway", gateway, "--opt", `com.docker.network.bridge.name=${bridgeName}`, "--opt", "com.docker.network.enable_ipv6=false", ...Object.entries(checkedLabels(labels)).flatMap(([key, value]) => ["--label", `${key}=${value}`]), networkName];
  const safeProbeNetwork = (metadata, labels, allowedContainerId = null) => {
    checkedLabels(labels);
    return Boolean(metadata?.Driver === "bridge" && metadata.Internal === false && metadata.EnableIPv6 === false && metadata.Options?.["com.docker.network.bridge.name"] === bridgeName && metadata.Options?.["com.docker.network.enable_ipv6"] === "false" && metadata.IPAM?.Config?.length === 1 && metadata.IPAM.Config[0].Subnet === subnet && metadata.IPAM.Config[0].Gateway === gateway && Object.entries(labels).every(([key, value]) => metadata.Labels?.[key] === value) && Object.entries(metadata.Containers || {}).every(([id, member]) => id === allowedContainerId && member.IPv4Address === `${address}/${range.prefix}`));
  };
  const ensureProbeNetwork = async ({ required, inspect, labels }) => {
    if (typeof required !== "function" || typeof inspect !== "function") failure();
    const existing = await inspect("network", networkName);
    if (existing) { if (!safeProbeNetwork(existing, labels)) failure(); return; }
    await required(probeNetworkArguments(labels));
    if (!safeProbeNetwork(await inspect("network", networkName), labels)) failure();
  };
  const assertProbeNetworkCollisions = ({ networks, routes, interfaces, labels, containerId = null }) => {
    if (!Array.isArray(networks) || !Array.isArray(routes) || !Array.isArray(interfaces)) failure();
    const own = networks.find((item) => item.Name === networkName);
    if (own && !safeProbeNetwork(own, labels, containerId)) failure();
    const overlaps = (cidr) => { const candidate = bounds(cidr); return candidate.start <= range.end && range.start <= candidate.end; };
    for (const item of networks) {
      if (item.Name === networkName) continue;
      if (item.Options?.["com.docker.network.bridge.name"] === bridgeName || (item.IPAM?.Config || []).some((entry) => entry.Subnet && !entry.Subnet.includes(":") && overlaps(entry.Subnet))) failure();
    }
    for (const route of routes) {
      if (!route.dst || route.dst === "default" || route.dst.includes(":")) continue;
      const candidate = bounds(route.dst);
      if (overlaps(route.dst) && !(own && route.dev === bridgeName && candidate.start >= range.start && candidate.end <= range.end)) failure();
    }
    if (!own && interfaces.some((item) => item.ifname === bridgeName)) failure();
  };
  const installProbeHostPolicy = (options) => { const policy = hostProbePolicy(); applyPolicy(executor({ ...options, pid: undefined }), [policy[1], policy[2], policy[3], policy[0]]); };
  const verifyProbeHostPolicy = (options) => assertPolicy(executor({ ...options, pid: undefined }), hostProbePolicy());
  const installProbeNamespace = (options) => { if (!options?.pid) failure(); applyPolicy(executor(options), namespaceProbePolicy()); };
  const verifyProbeNamespace = (options) => { if (!options?.pid) failure(); assertPolicy(executor(options), namespaceProbePolicy()); };
  const probeDropCount = (options, ipv6 = false) => {
    if (!options?.pid) failure();
    const result = executor(options)(ipv6 ? "ip6tables" : "iptables", ["-w", "5", "-n", "-v", "-x", "-L", ipv6 ? chains.NS6 : chains.NS]);
    const rows = result.stdout.trim().split("\n").map((line) => line.trim().split(/\s+/)).filter((values) => values[2] === "DROP");
    if (!rows.length || rows.some((values) => !/^\d+$/.test(values[0]))) failure();
    return rows.reduce((sum, values) => sum + Number(values[0]), 0);
  };
  const denialAddress = (value) => {
    if (isIP(value) === 6) return value;
    const candidate = bounds(value), number = candidate.start + (candidate.prefix < 31 ? 1 : 0);
    return [24, 16, 8, 0].map((shift) => Math.floor(number / 2 ** shift) % 256).join(".");
  };
  // IPv6 has no public route on this bridge; ::1 proves its deny counter
  // without mistaking an unrouteable global address for firewall acceptance.
  const blockedProbeChecks = [["127.0.0.1", 80], ["127.0.0.11", 80], ["169.254.169.254", 80], ["10.255.255.254", 80], [postgresIp, 80], [postgresIp, 6379], [address, 80], [gateway, 80], [resolver, 444], ["::1", 80], ...hostAddresses.filter((value) => isIP(value) !== 6).map((value) => [denialAddress(value), 443])];
  const alternateResolver = ["8.8.8.8", "9.9.9.9"].find((ip) => ip !== resolver);
  blockedProbeChecks.push([alternateResolver, 53]);
  const connectivityAuditCode = () => `
const dns=require('node:dns').promises,https=require('node:https'),net=require('node:net');
const timeout=(operation)=>Promise.race([operation,new Promise((_,reject)=>setTimeout(()=>reject(new Error('deadline')),6000))]);
const tcp=(host,port)=>new Promise(resolve=>{const socket=net.connect({host,port});socket.setTimeout(4000);socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false)});});
(async()=>{
 const embedded=await timeout(dns.resolve4('example.com'));const resolver=new dns.Resolver();resolver.setServers([${JSON.stringify(resolver)}]);const direct=await timeout(resolver.resolve4('example.com'));
 if(!embedded.length||!direct.length||!await tcp(${JSON.stringify(postgresIp)},5432))throw new Error('network');
 await timeout(new Promise((resolve,reject)=>{const request=https.get('https://example.com/',{family:4,timeout:5000},response=>{response.resume();response.statusCode>=200&&response.statusCode<400?resolve():reject(new Error('http'));});request.once('error',reject);request.once('timeout',()=>{request.destroy();reject(new Error('deadline'));});}));
 process.stdout.write('allowed-network-ok');process.exit(0);
})().catch(()=>process.exit(1));`;
  const verifyProbeConnectivity = async (options) => {
    const { containerId, required, pid } = options || {};
    if (!/^[a-f0-9]{64}$/.test(containerId || "") || typeof required !== "function" || !Number.isSafeInteger(pid) || pid <= 1) failure();
    verifyProbeHostPolicy(options); verifyProbeNamespace(options);
    if (String(await required(["exec", containerId, "node", "-e", connectivityAuditCode()])).trim() !== "allowed-network-ok") failure();
    for (const [host, port] of blockedProbeChecks) {
      const v6 = isIP(host) === 6, before = probeDropCount(options, v6);
      const code = `const socket=require('node:net').connect({host:${JSON.stringify(host)},port:${port}});socket.setTimeout(650);socket.once('connect',()=>process.exit(1));socket.once('error',()=>process.exit(0));socket.once('timeout',()=>{socket.destroy();process.exit(0)});`;
      await required(["exec", containerId, "node", "-e", code]);
      if (probeDropCount(options, v6) <= before) failure();
    }
    return { publicDns: true, publicHttps: true, postgresOnly: true, denialCountersVerified: blockedProbeChecks.length };
  };
  return Object.freeze({ probeNetwork: networkName, probeBridge: bridgeName, probeSubnet: subnet, probeAddress: address, probeGateway: gateway, probeResolver: resolver, postgresIp, deniedProbeRanges: Object.freeze(denied), blockedProbeChecks: Object.freeze(blockedProbeChecks.map(Object.freeze)), chains, probeNetworkArguments, safeProbeNetwork, ensureProbeNetwork, assertProbeNetworkCollisions, hostProbePolicy, namespaceProbePolicy, installProbeHostPolicy, verifyProbeHostPolicy, installProbeNamespace, verifyProbeNamespace, probeDropCount, connectivityAuditCode, verifyProbeConnectivity });
}
