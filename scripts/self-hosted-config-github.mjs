// Runtime-only credential update. Read one JSON line from stdin, never argv.
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline";

const fail = () => { throw new Error("GitHub configuration update refused; credential details suppressed."); };
const keys = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];

export function updatedConfiguration(contents, credentials) {
  const source = parseEnv(contents);
  if (source.OUTRAY_DEPLOYMENT_MODE !== "self-hosted"
    || !source.OUTRAY_SIGNUP_ALLOWED_EMAILS?.trim()
    || source.OUTRAY_SIGNUP_ALLOWED_DOMAINS?.trim()
    || !keys.every((key) => Object.hasOwn(source, key))) fail();
  if (!credentials || Object.keys(credentials).sort().join(",") !== "clientId,clientSecret"
    || !/^[A-Za-z0-9_-]{10,100}$/.test(credentials.clientId || "")
    || !/^[A-Za-z0-9_-]{20,200}$/.test(credentials.clientSecret || "")) fail();
  const values = { GITHUB_CLIENT_ID: credentials.clientId, GITHUB_CLIENT_SECRET: credentials.clientSecret };
  let output = contents;
  for (const key of keys) {
    const expression = new RegExp(`^${key}=.*$`, "gm");
    if ((output.match(expression) || []).length !== 1) fail();
    output = output.replace(expression, `${key}=${JSON.stringify(values[key])}`);
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
  const temporary = `${target}.github-${randomUUID()}`;
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
    if (line.length > 1024) fail();
    saveConfiguration(process.argv[3], JSON.parse(line));
    console.log("GitHub credentials saved to the private self-hosted runtime configuration. Other values are unchanged.");
  } catch {
    console.error("GitHub configuration update refused; credential details suppressed.");
    process.exitCode = 1;
  } finally {
    reader?.close();
    process.stdin.pause();
  }
}
