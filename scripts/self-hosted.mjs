import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = resolve(root, "deploy/self-hosted/.env.example");
const hostKeys = ["OUTRAY_APP_HOST", "OUTRAY_TUNNEL_DOMAIN", "OUTRAY_EDGE_HOST", "OUTRAY_INGEST_HOST", "OUTRAY_STATUS_HOST", "OUTRAY_SHARE_HOST"];
const secretKeys = ["POSTGRES_PASSWORD", "SHARE_DATABASE_PASSWORD", "BETTER_AUTH_SECRET", "ADMIN_PASSPHRASE", "INTERNAL_API_SECRET", "STATUS_EDGE_SECRET", "UPTIME_RATE_LIMIT_SECRET", "UPTIME_UNSUBSCRIBE_SECRET", "SHARE_RATE_LIMIT_SECRET"];
const integerKeys = ["OUTRAY_MAX_TUNNELS", "OUTRAY_MAX_DOMAINS", "OUTRAY_MAX_SUBDOMAINS", "OUTRAY_MAX_MEMBERS", "OUTRAY_BANDWIDTH_BYTES_PER_MONTH", "OUTRAY_MAX_UPTIME_MONITORS", "OUTRAY_MAX_OBSERVABILITY_ALERTS"];

export function validHostname(value) {
  return typeof value === "string" && value.length <= 253 && isIP(value) === 0 &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value);
}

export function initialEnvironment(domain, email, source = readFileSync(template, "utf8")) {
  if (!validHostname(domain)) throw new Error("--domain must be a bare lowercase public hostname");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) throw new Error("--email must be your sign-in/ACME email address");
  const replacements = {
    OUTRAY_APP_HOST: domain, OUTRAY_TUNNEL_DOMAIN: `tunnels.${domain}`,
    OUTRAY_EDGE_HOST: `edge.${domain}`, OUTRAY_INGEST_HOST: `ingest.${domain}`,
    OUTRAY_STATUS_HOST: `status.${domain}`, OUTRAY_SHARE_HOST: `share.${domain}`,
    CADDY_EMAIL: email, OUTRAY_SIGNUP_ALLOWED_EMAILS: email,
    OUTRAY_SECRETS_ACTIVE_MASTER_KEY: randomBytes(32).toString("base64"),
    ...Object.fromEntries(secretKeys.map((key) => [key, randomBytes(32).toString("hex")])),
  };
  if (hostKeys.some((key) => !validHostname(replacements[key]))) throw new Error("--domain is too long for the generated service hostnames");
  // Preserve template comments and only substitute generated fields; never read .env/.env.prod.
  return source.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, key) =>
    Object.hasOwn(replacements, key) ? `${key}=${replacements[key]}` : line);
}

export function checkEnvironment(env) {
  const errors = [], warnings = [];
  if (env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted") errors.push("OUTRAY_DEPLOYMENT_MODE must be self-hosted");
  const products = (env.OUTRAY_PRODUCTS || "tunnels,observability,secrets,uptime").split(",").map((value) => value.trim()).filter(Boolean);
  if (!products.length || products.some((product) => !["tunnels", "observability", "secrets", "uptime"].includes(product))) errors.push("OUTRAY_PRODUCTS must contain supported product names");
  for (const key of hostKeys) if (!validHostname(env[key])) errors.push(`${key} must be a bare public hostname`);
  if (new Set(hostKeys.map((key) => env[key])).size !== hostKeys.length) errors.push("Public hostnames must be distinct");
  // An edge host nested in a reserved status namespace would route to the renderer, not WebSockets.
  const status = env.OUTRAY_STATUS_HOST;
  for (const key of hostKeys.filter((key) => key !== "OUTRAY_STATUS_HOST")) {
    if (env[key] && status && env[key].endsWith(`.${status}`)) errors.push(`${key} cannot use the reserved status namespace`);
  }
  for (const key of secretKeys) if (!/^[a-f0-9]{64}$/.test(env[key] || "")) errors.push(`${key} needs its generated 32-byte hex credential`);
  if (new Set(secretKeys.map((key) => env[key])).size !== secretKeys.length) errors.push("Installation signing keys and database passwords must be distinct");
  if (!env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim() || !/^[A-Za-z0-9+/]{43}=$/.test(env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY || "") || Buffer.from(env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY, "base64").length !== 32) errors.push("Secrets requires a key ID and base64 32-byte master key");
  try {
    const previous = JSON.parse(env.OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS || "{}");
    if (!previous || typeof previous !== "object" || Array.isArray(previous) || Object.entries(previous).some(([id, key]) => !id.trim() || typeof key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, "base64").length !== 32)) throw new Error();
    const ids = [env.OUTRAY_SECRETS_ACTIVE_MASTER_KEY_ID?.trim(), ...Object.keys(previous).map((id) => id.trim())];
    if (new Set(ids).size !== ids.length) throw new Error();
  } catch { errors.push("OUTRAY_SECRETS_PREVIOUS_MASTER_KEYS must be a valid keyring JSON object"); }
  if (!/^[a-z_][a-z0-9_]*$/.test(env.POSTGRES_USER || "") || env.POSTGRES_USER === "outray_share_app" || !/^[a-z_][a-z0-9_]*$/.test(env.POSTGRES_DB || "")) errors.push("POSTGRES_USER/POSTGRES_DB must be safe identifiers, with a separate Share role");
  const providers = ["GITHUB", "GOOGLE"];
  if (!providers.some((provider) => env[`${provider}_CLIENT_ID`]?.trim() && env[`${provider}_CLIENT_SECRET`]?.trim())) errors.push("Configure at least one complete GitHub or Google OAuth app");
  for (const provider of providers) if (Boolean(env[`${provider}_CLIENT_ID`]?.trim()) !== Boolean(env[`${provider}_CLIENT_SECRET`]?.trim())) errors.push(`${provider} OAuth credentials must be supplied together`);
  const emails = (env.OUTRAY_SIGNUP_ALLOWED_EMAILS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const domains = (env.OUTRAY_SIGNUP_ALLOWED_DOMAINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!emails.length && !domains.length) errors.push("Signup allowlist is empty; no new user can sign in");
  if (emails.some((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) errors.push("OUTRAY_SIGNUP_ALLOWED_EMAILS contains an invalid address");
  if (domains.some((domain) => !validHostname(domain.toLowerCase()))) errors.push("OUTRAY_SIGNUP_ALLOWED_DOMAINS contains an invalid domain");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.CADDY_EMAIL || "")) errors.push("CADDY_EMAIL is required for certificates");
  try {
    const url = new URL(env.TINYBIRD_API_HOST);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  } catch { errors.push("TINYBIRD_API_HOST must be a bare HTTPS API origin"); }
  for (const key of ["TINYBIRD_INGEST_TOKEN", "TINYBIRD_QUERY_TOKEN"]) if (!env[key]?.trim() || /^(?:your_|replace_|CHANGE_ME)/i.test(env[key])) errors.push(`${key} is required`);
  if (!["auto", "free", "pro"].includes(env.OUTRAY_ICON_MODE || "auto")) errors.push("OUTRAY_ICON_MODE must be auto, free, or pro");
  if (env.OUTRAY_ICON_MODE === "pro" && (!env.HUGEICONS_LICENSE_KEY?.trim() || /^(?:your_|replace_|CHANGE_ME)/i.test(env.HUGEICONS_LICENSE_KEY))) errors.push("OUTRAY_ICON_MODE=pro needs your own HUGEICONS_LICENSE_KEY; free mode needs no license");
  if (env.TINYBIRD_INGEST_TOKEN && env.TINYBIRD_INGEST_TOKEN === env.TINYBIRD_QUERY_TOKEN) errors.push("Use separate APPEND-only and READ-only Tinybird tokens");
  for (const key of integerKeys) if (!Number.isSafeInteger(Number(env[key])) || Number(env[key]) < 1) errors.push(`${key} must be a positive safe integer`);
  if (!Number.isInteger(Number(env.OUTRAY_RETENTION_DAYS)) || Number(env.OUTRAY_RETENTION_DAYS) < 1 || Number(env.OUTRAY_RETENTION_DAYS) > 90) errors.push("OUTRAY_RETENTION_DAYS must be between 1 and 90");
  for (const protocol of ["TCP", "UDP"]) {
    const min = Number(env[`${protocol}_PORT_RANGE_MIN`]), max = Number(env[`${protocol}_PORT_RANGE_MAX`]);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1024 || max > 65535 || max < min || max - min > 999) errors.push(`${protocol} port range must be 1-1000 non-privileged ports`);
  }
  for (const key of ["UPTIME_PROBES_ENABLED", "UPTIME_EGRESS_POLICY_READY", "UPTIME_NOTIFICATIONS_ENABLED"]) if (!["true", "false"].includes(env[key])) errors.push(`${key} must be true or false`);
  if (env.UPTIME_PROBES_ENABLED === "true" && env.UPTIME_EGRESS_POLICY_READY !== "true") errors.push("Public Uptime probes require a verified egress policy; the flag does not configure a firewall");
  if (!products.includes("uptime") && (env.UPTIME_PROBES_ENABLED === "true" || env.UPTIME_NOTIFICATIONS_ENABLED === "true")) errors.push("Enable the Uptime product before enabling its worker");
  if (env.UPTIME_PROBES_ENABLED !== "true" && env.UPTIME_NOTIFICATIONS_ENABLED !== "true") warnings.push("Uptime checks and notification delivery are disabled until the worker is configured");
  if (env.UPTIME_NOTIFICATIONS_ENABLED === "true" && (!env.ZEPTO_API_KEY || !env.ZEPTO_FROM_EMAIL)) errors.push("Uptime email delivery needs ZEPTO_API_KEY and a verified ZEPTO_FROM_EMAIL");
  if (env.ZEPTO_FROM_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.ZEPTO_FROM_EMAIL)) errors.push("ZEPTO_FROM_EMAIL must be a valid sender address");
  if (!env.ZEPTO_API_KEY || !env.ZEPTO_FROM_EMAIL) warnings.push("Invitation and notification emails need your own ZeptoMail sender configuration");
  if (!validPrivateSubnet(env.OUTRAY_DOCKER_SUBNET, env.OUTRAY_CADDY_PRIVATE_IP)) errors.push("Configure a private IPv4 Docker subnet (/16 to /28) with a usable fixed Caddy IP inside it");
  return { errors, warnings };
}

function validPrivateSubnet(cidr, address) {
  const [network, prefix, extra] = (cidr || "").split("/");
  if (extra !== undefined || isIP(network || "") !== 4 || isIP(address || "") !== 4 || !/^\d+$/.test(prefix || "")) return false;
  const bits = Number(prefix);
  if (bits < 16 || bits > 28) return false;
  const numeric = (ip) => ip.split(".").reduce((result, octet) => result * 256 + Number(octet), 0);
  const block = 2 ** (32 - bits), start = numeric(network), ip = numeric(address);
  const privateNetwork = network.startsWith("10.") || network.startsWith("192.168.") || (network.startsWith("172.") && Number(network.split(".")[1]) >= 16 && Number(network.split(".")[1]) <= 31);
  return privateNetwork && start % block === 0 && ip > start + 1 && ip < start + block - 1;
}

export function initialize(file, domain, email) {
  const content = initialEnvironment(domain, email);
  // Never overwrite keys for an initialized installation (including ciphertext master keys).
  writeFileSync(file, content, { mode: 0o600, flag: "wx" });
}

function option(args, key, fallback) {
  const index = args.indexOf(key);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${key} requires a value`);
  return args[index + 1];
}

export function main(args = process.argv.slice(2)) {
  const command = args[0];
  const file = resolve(root, option(args, "--file", ".env.self-hosted"));
  if (command === "init") {
    initialize(file, option(args, "--domain"), option(args, "--email"));
    console.log("Created private self-hosted configuration. Fill OAuth/Tinybird credentials, back up the master key, then run npm run self-host:check. Free icons need no build credential. No services were started.");
    return;
  }
  if (command !== "check" && command !== "up") throw new Error("Use init --domain ops.your-domain --email you@your-domain, check, or up (optional --file path)");
  const env = parseEnv(readFileSync(file, "utf8"));
  const { errors, warnings } = checkEnvironment(env);
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  if (errors.length) throw new Error(`Configuration incomplete:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  console.log("Self-hosted configuration passes local checks. No credential values were printed.");
  if (command === "check") return;
  const dockerArgs = ["compose", "--project-name", "outray-self-hosted", "--env-file", file, "--file", resolve(root, "deploy/self-hosted/compose.yaml")];
  if (env.OUTRAY_ICON_MODE !== "free" && env.HUGEICONS_LICENSE_KEY?.trim() && !/^(?:your_|replace_|CHANGE_ME)/i.test(env.HUGEICONS_LICENSE_KEY)) {
    dockerArgs.push("--file", resolve(root, "deploy/self-hosted/compose.pro-icons.yaml"));
  }
  if (env.UPTIME_PROBES_ENABLED === "true" || env.UPTIME_NOTIFICATIONS_ENABLED === "true") dockerArgs.push("--profile", "uptime-worker");
  dockerArgs.push("up", "--detach", "--build");
  const result = spawnSync("docker", dockerArgs, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  if (result.error) throw new Error("Could not start Docker Compose. Install Docker Engine/Compose and check its daemon.");
  if (result.status !== 0) throw new Error("Docker Compose did not complete successfully; inspect its service logs");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    // Only our fixed validation messages are safe. Native filesystem errors can contain filenames but not file contents.
    console.error(error?.code === "EEXIST" ? "Configuration already exists; refusing to replace installation keys." : error?.code === "ENOENT" ? "Configuration not found; run self-host:init first." : error.message);
    process.exitCode = 1;
  }
}
