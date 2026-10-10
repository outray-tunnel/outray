// Independent Ops runtime credentials arrive on stdin, never in argv or logs.
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline";

export const opsWorkspace = { id: "b603a640-07eb-4089-baaa-99840b7ac34a", name: "internal_ops" };
export const opsTinybirdHost = "https://api.europe-west2.gcp.tinybird.co";
const fail = () => { throw new Error("Tinybird configuration update refused; credential details suppressed."); };
const keys = ["TINYBIRD_API_HOST", "TINYBIRD_QUERY_TOKEN", "TINYBIRD_INGEST_TOKEN"];

export function updatedConfiguration(contents, credentials) {
  const source = parseEnv(contents);
  if (source.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" || source.OUTRAY_APP_HOST !== "ops.outray.dev"
    || (source.CONSOLE_PUBLIC_URL && source.CONSOLE_PUBLIC_URL !== "https://ops.outray.dev")
    || !source.OUTRAY_SIGNUP_ALLOWED_EMAILS?.trim() || source.OUTRAY_SIGNUP_ALLOWED_DOMAINS?.trim()
    || !keys.every((key) => Object.hasOwn(source, key)) || source.TINYBIRD_TUNNEL_INGEST_TOKEN?.trim()) fail();
  if (!credentials || Object.keys(credentials).sort().join(",") !== "apiHost,ingestToken,queryToken,workspaceId,workspaceName"
    || credentials.workspaceId !== opsWorkspace.id || credentials.workspaceName !== opsWorkspace.name
    || credentials.apiHost !== opsTinybirdHost
    || ![credentials.queryToken, credentials.ingestToken].every((value) => typeof value === "string" && /^[A-Za-z0-9._~+\/=-]{20,4096}$/.test(value))
    || credentials.queryToken === credentials.ingestToken) fail();
  const values = { TINYBIRD_API_HOST: credentials.apiHost, TINYBIRD_QUERY_TOKEN: credentials.queryToken, TINYBIRD_INGEST_TOKEN: credentials.ingestToken };
  let output = contents;
  for (const key of keys) {
    const expression = new RegExp(`^${key}=.*$`, "gm");
    if ((output.match(expression) || []).length !== 1) fail();
    output = output.replace(expression, () => `${key}=${JSON.stringify(values[key])}`);
  }
  const result = parseEnv(output);
  if (Object.keys(source).sort().join(",") !== Object.keys(result).sort().join(",")
    || Object.keys(source).some((key) => result[key] !== (keys.includes(key) ? values[key] : source[key]))) fail();
  return output;
}

export function saveConfiguration(file, credentials) {
  const target = resolve(file);
  if ([".env", ".env.prod", ".env.production"].includes(basename(target)) || realpathSync(target) !== target) fail();
  const info = lstatSync(target), parent = lstatSync(dirname(target));
  if (!info.isFile() || info.mode & 0o077 || !parent.isDirectory() || parent.mode & 0o077
    || info.uid !== process.getuid() || parent.uid !== process.getuid()) fail();
  const output = updatedConfiguration(readFileSync(target, "utf8"), credentials);
  const temporary = `${target}.tinybird-${randomUUID()}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, output);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let reader;
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--file") fail();
    reader = createInterface({ input: process.stdin, terminal: false });
    const line = await new Promise((complete, reject) => {
      const timer = setTimeout(() => reject(new Error()), 30_000);
      reader.once("line", (value) => { clearTimeout(timer); complete(value); });
      reader.once("close", () => { clearTimeout(timer); reject(new Error()); });
    });
    reader.close();
    process.stdin.pause();
    if (line.length > 10000) fail();
    saveConfiguration(process.argv[3], JSON.parse(line));
    console.log("Scoped Tinybird credentials saved to the private Ops runtime configuration; all other values preserved.");
  } catch {
    console.error("Tinybird configuration update refused; credential details suppressed.");
    process.exitCode = 1;
  } finally { reader?.close(); process.stdin.pause(); }
}
