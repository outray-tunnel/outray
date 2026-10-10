// Independent Ops probe isolation. Never changes existing firewall policies or flushes a table.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const probeNetwork = "outray-ops-probe-egress";
export const probeBridge = "br-or-probe";
export const probeSubnet = "172.21.42.0/29";
export const probeAddress = "172.21.42.2";
export const probeGateway = "172.21.42.1";
export const probeResolver = "1.1.1.1";
export const probePolicyDirectory = "/etc/outray-ops-probe";
export const probePolicyUnit = "outray-ops-probe-policy.service";
const outChain = "OR_OPS_PROBE_OUT";
const inChain = "OR_OPS_PROBE_IN";
const v6Chain = "OR_OPS_PROBE_V6";
const nsChain = "OR_OPS_PROBE_NS";
const nsV6Chain = "OR_OPS_PROBE_NS6";
const replyChain = "OR_OPS_PROBE_PGR";
const failure = () => { throw new Error("Ops probe network operation refused; sensitive diagnostics suppressed. Existing unrelated rules and services are preserved."); };
export const deniedProbeRanges = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "209.74.86.0/24"];

function validatedPostgres(value) {
  if (isIP(value) !== 4 || !/^172\.18\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/.test(value)
    || value.split(".").some((part) => Number(part) > 255) || ["172.18.0.0", "172.18.0.1", "172.18.255.255"].includes(value)) failure();
  return value;
}

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rule = (chain, ...args) => ["-A", chain, ...args];
const tcp = (chain, ip, port, action = "ACCEPT") => rule(chain, "-d", `${ip}/32`, "-p", "tcp", "-m", "tcp", "--dport", String(port), "-j", action);
const dns = (chain, embedded = false) => ["udp", "tcp"].map((protocol) => embedded
  // Docker's embedded DNS DNATs port 53 to its ephemeral listener BEFORE OUTPUT filtering.
  // Match the original tuple, not an unrestricted loopback or ephemeral port exception.
  ? rule(chain, "-d", "127.0.0.11/32", "-p", protocol, "-m", "conntrack", "--ctorigdst", "127.0.0.11", "--ctorigdstport", "53", "-j", "ACCEPT")
  : rule(chain, "-d", `${probeResolver}/32`, "-p", protocol, "-m", protocol, "--dport", "53", "-j", "ACCEPT"));
const embeddedDnsReplies = (chain) => ["udp", "tcp"].map((protocol) =>
  // Docker's DNS listener itself replies within this namespace. Permit only the
  // reply direction of that exact original DNS tuple, never generic established traffic.
  rule(chain, "-p", protocol, "-m", "conntrack", "--ctstate", "ESTABLISHED", "--ctorigdst", "127.0.0.11", "--ctorigdstport", "53", "--ctdir", "REPLY", "-j", "ACCEPT"));

export function probeNetworkArguments(labels) {
  if (!labels || !Object.keys(labels).length || Object.entries(labels).some(([key, value]) => !/^[a-z0-9.-]+$/.test(key) || typeof value !== "string" || /[\r\n\0]/.test(value))) failure();
  return ["network", "create", "--driver", "bridge", "--subnet", probeSubnet, "--gateway", probeGateway,
    "--opt", `com.docker.network.bridge.name=${probeBridge}`, "--opt", "com.docker.network.enable_ipv6=false",
    ...Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]), probeNetwork];
}

export function safeProbeNetwork(metadata, labels, allowedContainerId = null) {
  return Boolean(metadata?.Driver === "bridge" && metadata.Internal === false && metadata.EnableIPv6 === false
    && metadata.Options?.["com.docker.network.bridge.name"] === probeBridge
    && metadata.Options?.["com.docker.network.enable_ipv6"] === "false"
    && metadata.IPAM?.Config?.length === 1 && metadata.IPAM.Config[0].Subnet === probeSubnet && metadata.IPAM.Config[0].Gateway === probeGateway
    && Object.entries(labels).every(([key, value]) => metadata.Labels?.[key] === value)
    && Object.entries(metadata.Containers || {}).every(([id, member]) => id === allowedContainerId && member.IPv4Address === `${probeAddress}/29`));
}

export async function ensureProbeNetwork({ required, inspect, labels }) {
  const existing = inspect("network", probeNetwork);
  if (existing) { if (!safeProbeNetwork(existing, labels)) failure(); return; }
  // The runner must also verify every network/host route for collisions before this mutation.
  required(probeNetworkArguments(labels));
  if (!safeProbeNetwork(inspect("network", probeNetwork), labels)) failure();
}

export function hostProbePolicy(postgresIp) {
  const pg = validatedPostgres(postgresIp);
  const out = [rule(outChain, "!", "-s", `${probeAddress}/32`, "-j", "DROP"), tcp(outChain, pg, 5432),
    ...deniedProbeRanges.map((range) => rule(outChain, "-d", range, "-j", "DROP")), ...dns(outChain),
    ...[80, 443].map((port) => rule(outChain, "-p", "tcp", "-m", "tcp", "--dport", String(port), "-j", "ACCEPT")), rule(outChain, "-j", "DROP")];
  return [
    { binary: "iptables", chain: outChain, rules: out, hooks: [["DOCKER-USER", "-i", probeBridge]] },
    { binary: "iptables", chain: inChain, rules: [rule(inChain, "-j", "DROP")], hooks: [["INPUT", "-i", probeBridge]] },
    { binary: "ip6tables", chain: v6Chain, rules: [rule(v6Chain, "-j", "DROP")], hooks: [["INPUT", "-i", probeBridge], ["FORWARD", "-i", probeBridge]] },
    { binary: "iptables", chain: replyChain,
      rules: [rule(replyChain, "-s", `${pg}/32`, "-d", `${probeAddress}/32`, "-p", "tcp", "-m", "tcp", "--sport", "5432", "-m", "conntrack", "--ctstate", "ESTABLISHED", "-j", "ACCEPT"), rule(replyChain, "-j", "DROP")],
      hooks: [["DOCKER-USER", "-s", `${pg}/32`, "-d", `${probeAddress}/32`, "-p", "tcp", "-m", "tcp", "--sport", "5432", "-m", "conntrack", "--ctstate", "ESTABLISHED"]] },
  ];
}

export function namespaceProbePolicy(postgresIp) {
  const pg = validatedPostgres(postgresIp);
  return [
    { binary: "iptables", chain: nsChain, rules: [...dns(nsChain, true), ...embeddedDnsReplies(nsChain), tcp(nsChain, pg, 5432),
      ...deniedProbeRanges.map((range) => rule(nsChain, "-d", range, "-j", "DROP")), ...dns(nsChain),
      ...[80, 443].map((port) => rule(nsChain, "-p", "tcp", "-m", "tcp", "--dport", String(port), "-j", "ACCEPT")), rule(nsChain, "-j", "DROP")], hooks: [["OUTPUT"]] },
    { binary: "ip6tables", chain: nsV6Chain, rules: [rule(nsV6Chain, "-j", "DROP")], hooks: [["OUTPUT"]] },
  ];
}

function executor({ spawn = spawnSync, env = { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" }, pid } = {}) {
  if (pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 1)) failure();
  return (binary, args, optional = false) => {
    const selected = pid ? ["nsenter", ["--target", String(pid), "--net", "--", binary, ...args]] : [binary, args];
    const result = spawn(selected[0], selected[1], { env: { ...env, PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" }, encoding: "utf8", timeout: 10_000, maxBuffer: 500_000 });
    if (result.status !== 0 && !optional) failure();
    return result;
  };
}

const expectedChain = (definition) => [`-N ${definition.chain}`, ...definition.rules.map((args) => args.join(" "))].join("\n");
const normalizedRules = (text) => String(text).trim().replaceAll('"', "");
function hookArguments(definition, hook) { return [...hook, "-j", definition.chain]; }

function assertPolicy(execute, policy) {
  for (const definition of policy) {
    const result = execute(definition.binary, ["-w", "5", "-S", definition.chain]);
    if (normalizedRules(result.stdout) !== expectedChain(definition)) failure();
    for (const hook of definition.hooks) {
      const lines = normalizedRules(execute(definition.binary, ["-w", "5", "-S", hook[0]]).stdout).split("\n");
      const target = ["-A", ...hookArguments(definition, hook)].join(" ");
      // No unrelated earlier rule may bypass protection. Multiple owned exact hooks
      // (probe requests and established Pg replies) must occupy the first positions.
      const expectedHooks = policy.filter((item) => item.binary === definition.binary).flatMap((item) => item.hooks.filter((h) => h[0] === hook[0]).map((h) => ["-A", ...hookArguments(item, h)].join(" ")));
      const first = lines.filter((line) => line.startsWith(`-A ${hook[0]} `)).slice(0, expectedHooks.length);
      if (lines.filter((line) => line === target).length !== 1 || JSON.stringify(first.sort()) !== JSON.stringify(expectedHooks.sort())) failure();
    }
  }
}

function applyPolicy(execute, policy) {
  for (const definition of policy) {
    const existing = execute(definition.binary, ["-w", "5", "-S", definition.chain], true);
    if (existing.status === 0) {
      if (normalizedRules(existing.stdout) !== expectedChain(definition)) failure();
    } else {
      // A chain creation failure is fail-closed: the inert probe is not enabled.
      execute(definition.binary, ["-w", "5", "-N", definition.chain]);
      for (const args of definition.rules) execute(definition.binary, ["-w", "5", ...args]);
    }
    for (const hook of definition.hooks) {
      const args = hookArguments(definition, hook);
      const hookState = execute(definition.binary, ["-w", "5", "-C", ...args], true);
      if (hookState.status !== 0) execute(definition.binary, ["-w", "5", "-I", hook[0], "1", ...args.slice(1)]);
    }
  }
  assertPolicy(execute, policy);
}

export function probePolicyUnitText(postgresIp, script = "/opt/outray-ops/source/scripts/self-hosted-probe-network.mjs") {
  validatedPostgres(postgresIp);
  if (script !== "/opt/outray-ops/source/scripts/self-hosted-probe-network.mjs") failure();
  return `[Unit]\nDescription=Independent OutRay Ops probe outbound policy\nRequires=docker.service\nAfter=docker.service\nBefore=outray-ops-uptime-probe.service\n\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/node ${script} --restore --postgres-ip ${postgresIp}\nRemainAfterExit=yes\nUser=root\nGroup=root\nNoNewPrivileges=yes\nProtectHome=yes\nProtectSystem=full\nPrivateTmp=yes\n\n[Install]\nWantedBy=multi-user.target\n`;
}

function ownedFile(path, content) {
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o077) || readFileSync(path, "utf8") !== content) failure();
    return;
  } catch (error) { if (error?.code !== "ENOENT") throw error; }
  writeFileSync(path, content, { flag: "wx", mode: 0o600 });
}

export function installProbeHostPolicy(options) {
  const policy = hostProbePolicy(options.postgresIp), execute = executor({ ...options, pid: undefined });
  // Host INPUT and IPv6 protection are installed before forwarding is permitted.
  applyPolicy(execute, [policy[1], policy[2], policy[3], policy[0]]);
  if (options.persist) {
    if (process.getuid?.() !== 0) failure();
    mkdirSync(probePolicyDirectory, { mode: 0o700, recursive: true });
    const parent = lstatSync(probePolicyDirectory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || (parent.mode & 0o077)) failure();
    ownedFile(`${probePolicyDirectory}/policy.json`, `${JSON.stringify({ version: 1, postgresIp: options.postgresIp, fingerprint: digest(policy) })}\n`);
    ownedFile(`/etc/systemd/system/${probePolicyUnit}`, probePolicyUnitText(options.postgresIp));
    execute("systemctl", ["daemon-reload"]);
    execute("systemctl", ["enable", probePolicyUnit]);
    execute("systemctl", ["start", probePolicyUnit]);
  }
}

export function verifyProbeHostPolicy(options) { assertPolicy(executor({ ...options, pid: undefined }), hostProbePolicy(options.postgresIp)); }
export function installProbeNamespace(options) { applyPolicy(executor(options), namespaceProbePolicy(options.postgresIp)); }
export function verifyProbeNamespace(options) { assertPolicy(executor(options), namespaceProbePolicy(options.postgresIp)); }

export function probeDropCount(options, ipv6 = false) {
  const result = executor(options)(ipv6 ? "ip6tables" : "iptables", ["-w", "5", "-n", "-v", "-x", "-L", ipv6 ? nsV6Chain : nsChain]);
  const rows = result.stdout.trim().split("\n").map((line) => line.trim().split(/\s+/)).filter((fields) => fields[2] === "DROP");
  if (!rows.length || rows.some((fields) => !/^\d+$/.test(fields[0]))) failure();
  return rows.reduce((sum, fields) => sum + Number(fields[0]), 0);
}

export const blockedProbeChecks = [
  ["127.0.0.1", 80], ["127.0.0.11", 80], ["169.254.169.254", 80], ["10.200.200.1", 80],
  ["172.18.0.4", 6379], ["209.74.86.89", 443], [probeAddress, 80], [probeGateway, 80],
  ["8.8.8.8", 53], [probeResolver, 444], ["::1", 80],
];

export function connectivityAuditCode(postgresIp) {
  const pg = validatedPostgres(postgresIp);
  return `
const dns=require('node:dns').promises, https=require('node:https'), net=require('node:net');
const timeout=(promise)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('deadline')),6000))]);
const tcp=(host,port)=>new Promise((resolve)=>{const s=net.connect({host,port});s.setTimeout(4000);s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(false)});});
(async()=>{
 const embedded=await timeout(dns.resolve4('example.com'));
 const resolver=new dns.Resolver();resolver.setServers(['${probeResolver}']);const direct=await timeout(resolver.resolve4('example.com'));
 if(!embedded.length||!direct.length||!await tcp('${pg}',5432))throw new Error('network');
 await timeout(new Promise((resolve,reject)=>{const r=https.get('https://example.com/',{family:4,timeout:5000},s=>{s.resume();s.statusCode>=200&&s.statusCode<400?resolve():reject(new Error('http'));});r.once('error',reject);r.once('timeout',()=>{r.destroy();reject(new Error('deadline'));});}));
 process.stdout.write('allowed-network-ok');process.exit(0);
})().catch(()=>process.exit(1));`;
}

// Must be run while the actual worker container is inert. A failed/closed socket
// alone is not acceptance: each denied attempt must increment its namespace DROP counter.
export function verifyProbeConnectivity(options) {
  const { containerId, required, postgresIp } = options;
  if (!/^[a-f0-9]{64}$/.test(containerId || "") || typeof required !== "function") failure();
  verifyProbeHostPolicy(options); verifyProbeNamespace(options);
  const allowed = required(["exec", containerId, "node", "-e", connectivityAuditCode(postgresIp)]);
  if (String(allowed).trim() !== "allowed-network-ok") failure();
  for (const [host, port] of [...blockedProbeChecks, [validatedPostgres(postgresIp), 80]]) {
    const v6 = isIP(host) === 6, before = probeDropCount(options, v6);
    const code = `const s=require('node:net').connect({host:${JSON.stringify(host)},port:${port}});s.setTimeout(650);s.once('connect',()=>process.exit(1));s.once('error',()=>process.exit(0));s.once('timeout',()=>{s.destroy();process.exit(0)});`;
    required(["exec", containerId, "node", "-e", code]);
    if (probeDropCount(options, v6) <= before) failure();
  }
  return { publicDns: true, publicHttps: true, postgresOnly: true, denialCountersVerified: blockedProbeChecks.length + 1 };
}

// Boot restoration is deliberately secret-free; the guarded worker remains restart=no.
export function restoreProbePolicy(argv = process.argv.slice(2)) {
  if (argv.length !== 3 || argv[0] !== "--restore" || argv[1] !== "--postgres-ip" || process.getuid?.() !== 0) failure();
  const postgresIp = validatedPostgres(argv[2]), file = `${probePolicyDirectory}/policy.json`, info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o077)) failure();
  const saved = JSON.parse(readFileSync(file, "utf8"));
  if (saved.version !== 1 || saved.postgresIp !== postgresIp || saved.fingerprint !== digest(hostProbePolicy(postgresIp))) failure();
  installProbeHostPolicy({ postgresIp });
  console.log("Owned Ops probe-only network policy restored; no workers or unrelated services were started.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { restoreProbePolicy(); } catch { console.error("Ops probe policy restore refused; sensitive diagnostics suppressed."); process.exitCode = 1; }
}
