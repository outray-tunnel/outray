import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".outray");
const PROD_CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEV_CONFIG_FILE = path.join(CONFIG_DIR, "config.dev.json");

export interface OutRayConfig {
  authType: "user";
  userToken?: string;
  activeOrgId?: string;
  orgToken?: string;
  orgTokenExpiresAt?: string;
}

export class ConfigManager {
  private configFile: string;

  constructor(isDev: boolean) {
    this.configFile = isDev ? DEV_CONFIG_FILE : PROD_CONFIG_FILE;
  }

  ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    fs.chmodSync(CONFIG_DIR, 0o700);
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
