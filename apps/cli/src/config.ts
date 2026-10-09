import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { isIP } from "net";

const CONFIG_DIR = path.join(os.homedir(), ".outray");
const HOSTED_ORIGINS = new Set(["https://outray.dev", "https://outray.co"]);

/** Browser authentication is bound to an origin, never a user-supplied path.
 * Remote origins must use TLS; plain HTTP is only useful for local development. */
export function canonicalConsoleOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("OUTRAY_WEB_URL must be a valid console origin"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const address = hostname.replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || address === "::1" ||
    (isIP(address) === 4 && address.startsWith("127."));
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("OUTRAY_WEB_URL must be an HTTPS origin (or loopback HTTP), without credentials, a path, query or fragment");
  }
  url.hostname = hostname;
  return url.origin;
}

/** Hosted login files remain compatible. Custom installations use separate
 * files so neither user tokens nor exchanged organization tokens cross origins. */
export function authConfigFilename(isDev: boolean, webUrl?: string): string {
  const legacy = isDev ? "config.dev.json" : "config.json";
  if (webUrl === undefined) return legacy;
  const origin = canonicalConsoleOrigin(webUrl);
  if (HOSTED_ORIGINS.has(origin) || (isDev && origin === "http://localhost:6767")) return legacy;
  const scope = createHash("sha256").update(origin).digest("hex");
  return `config.instance.${scope}.json`;
}

export interface OutRayConfig {
  authType: "user";
  userToken?: string;
  activeOrgId?: string;
  orgToken?: string;
  orgTokenExpiresAt?: string;
}

export class ConfigManager {
  private configFile: string;
  private configDir: string;

  constructor(isDev: boolean, webUrl?: string, configDir = CONFIG_DIR) {
    this.configDir = configDir;
    this.configFile = path.join(configDir, authConfigFilename(isDev, webUrl));
  }

  ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
    fs.chmodSync(this.configDir, 0o700);
  }

  load(): OutRayConfig | null {
    if (!fs.existsSync(this.configFile)) {
      return null;
    }

    try {
      fs.chmodSync(this.configFile, 0o600);
      const data = fs.readFileSync(this.configFile, "utf-8");
      const config = JSON.parse(data) as OutRayConfig;

      return config;
    } catch (e) {
      return null;
    }
  }

  save(config: OutRayConfig): void {
    this.ensureConfigDir();
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), {
      mode: 0o600,
    });
    fs.chmodSync(this.configFile, 0o600);
  }

  clear(): void {
    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
    }
  }

  isOrgTokenValid(config: OutRayConfig): boolean {
    if (!config.orgToken || !config.orgTokenExpiresAt) {
      return false;
    }

    const expiresAt = new Date(config.orgTokenExpiresAt);
    const now = new Date();

    // Consider expired if less than 5 minutes remain
    return expiresAt.getTime() - now.getTime() > 5 * 60 * 1000;
  }

  getActiveToken(config: OutRayConfig): string | null {
    if (config.authType === "user" && config.orgToken) {
      return config.orgToken;
    }

    return null;
  }
}
