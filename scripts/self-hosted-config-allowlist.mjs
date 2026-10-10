// Update only an explicitly confirmed address on the independent Ops instance.
import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createInterface } from "node:readline";

const key = "OUTRAY_SIGNUP_ALLOWED_EMAILS";
const fail = () => { throw new Error("Ops allowlist update refused; configuration details suppressed."); };
const validEmail = (value) => typeof value === "string" && value === value.trim().toLowerCase()
  && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);

export function updatedConfiguration(contents, correction) {
  const source = parseEnv(contents);
  if (source.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" || source.OUTRAY_APP_HOST !== "ops.outray.dev"
    || (source.CONSOLE_PUBLIC_URL && source.CONSOLE_PUBLIC_URL !== "https://ops.outray.dev")
    || source.OUTRAY_SIGNUP_ALLOWED_DOMAINS?.trim() || !Object.hasOwn(source, key)) fail();
  if (!correction || Object.keys(correction).sort().join(",") !== "expectedEmail,keepEmail,replacementEmail"
    || !Object.values(correction).every(validEmail) || new Set(Object.values(correction)).size !== 3) fail();
  const expression = new RegExp(`^${key}=.*$`, "gm");
  if ((contents.match(expression) || []).length !== 1) fail();
  const addresses = source[key].split(",").map((email) => email.trim().toLowerCase());
  if (addresses.length !== 2 || new Set(addresses).size !== 2 || !addresses.every(validEmail)
    || !addresses.includes(correction.keepEmail)) fail();
  if (!addresses.includes(correction.expectedEmail)) {
    if (addresses.includes(correction.replacementEmail)) return contents;
    fail();
  }
  const value = addresses.map((email) => email === correction.expectedEmail ? correction.replacementEmail : email).join(",");
  const output = contents.replace(expression, () => `${key}=${JSON.stringify(value)}`);
  const result = parseEnv(output);
  if (Object.keys(source).sort().join(",") !== Object.keys(result).sort().join(",")
    || Object.keys(source).some((name) => result[name] !== (name === key ? value : source[name]))) fail();
  return output;
}

export function saveConfiguration(file, correction) {
  const target = resolve(file);
  if ([".env", ".env.prod", ".env.production"].includes(basename(target)) || realpathSync(target) !== target) fail();
  const info = lstatSync(target), parent = lstatSync(dirname(target));
  if (!info.isFile() || info.mode & 0o077 || !parent.isDirectory() || parent.mode & 0o077
    || info.uid !== process.getuid() || parent.uid !== process.getuid()) fail();
  const source = readFileSync(target, "utf8"), output = updatedConfiguration(source, correction);
  if (output === source) return;
  const temporary = `${target}.allowlist-${randomUUID()}`;
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
    reader.close(); process.stdin.pause();
    if (line.length > 2048) fail();
    saveConfiguration(process.argv[3], JSON.parse(line));
    console.log("Confirmed Ops email correction saved; other addresses, credentials and configuration preserved.");
  } catch { console.error("Ops allowlist update refused; configuration details suppressed."); process.exitCode = 1; }
  finally { reader?.close(); process.stdin.pause(); }
}
