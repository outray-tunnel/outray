#!/usr/bin/env node

import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";
import { OutRayClient } from "./client";

const CONFIG_DIR = path.join(os.homedir(), ".outray");
const PROD_CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEV_CONFIG_FILE = path.join(CONFIG_DIR, "config.dev.json");

function getConfigFile(isDev: boolean): string {
  return isDev ? DEV_CONFIG_FILE : PROD_CONFIG_FILE;
}

function saveConfig(config: { token: string }, isDev: boolean) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const configFile = getConfigFile(isDev);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  const envLabel = isDev ? chalk.yellow("[DEV]") : chalk.blue("[PROD]");
  console.log(chalk.green(`✅ ${envLabel} Auth token saved successfully!`));
}

function loadConfig(isDev: boolean): { token?: string } {
  const configFile = getConfigFile(isDev);
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, "utf-8"));
    } catch (e) {
      return {};
    }
  }
  return {};
}

async function validateToken(token: string, webUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${webUrl}/api/tunnel/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = (await response.json()) as {
      valid: boolean;
      error?: string;
    };

    if (!data.valid) {
      throw new Error(data.error || "Invalid token");
    }

    return true;
  } catch (error) {
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isDev =
    process.env.NODE_ENV === "development" || args.includes("--dev");
  const serverUrl =
    process.env.OUTRAY_SERVER_URL ||
    (isDev ? "ws://localhost:3547" : "wss://api.outray.dev/");
  const webUrl =
    process.env.OUTRAY_WEB_URL ||
    (isDev ? "http://localhost:3000" : "https://console.outray.dev");

  if (!command) {
    console.log(chalk.red("❌ Please specify a command"));
    console.log(chalk.cyan("Usage:"));
    console.log(
      chalk.cyan("  outray login <token>    Save your authentication token"),
    );
    console.log(chalk.cyan("  outray http <port>      Start an HTTP tunnel"));
    console.log(
      chalk.cyan("  outray <port>           Start an HTTP tunnel (shorthand)"),
    );
    console.log(chalk.cyan("\nOptions:"));
    console.log(
      chalk.cyan("  --dev                   Use development environment"),
    );
    process.exit(1);
  }

  if (command === "login") {
    const token = args[1];
    if (!token) {
      console.log(chalk.red("❌ Please provide an auth token"));
      console.log(chalk.cyan("Usage: outray login <token> [--dev]"));
      process.exit(1);
    }

    const envLabel = isDev ? chalk.yellow("[DEV]") : chalk.blue("[PROD]");
    console.log(chalk.cyan(`${envLabel} Validating token...`));
    console.log(chalk.gray(`  Connecting to ${webUrl}`));
    try {
      await validateToken(token, webUrl);
      saveConfig({ token }, isDev);
    } catch (err) {
      console.log(
        chalk.red(
          `❌ Validation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ),
      );
      process.exit(1);
    }
    return;
  }

  let localPort: number;
  let remainingArgs: string[];

  if (command === "http") {
    const portArg = args[1];
    if (!portArg) {
      console.log(chalk.red("❌ Please specify a port"));
      console.log(chalk.cyan("Usage: outray http <port>"));
      process.exit(1);
    }
    localPort = parseInt(portArg, 10);
    remainingArgs = args.slice(2);
  } else if (!isNaN(parseInt(command, 10))) {
    localPort = parseInt(command, 10);
    remainingArgs = args.slice(1);
  } else {
    console.log(chalk.red(`❌ Unknown command: ${command}`));
    process.exit(1);
  }

  if (isNaN(localPort!) || localPort! < 1 || localPort! > 65535) {
    console.log(chalk.red("❌ Invalid port number"));
    console.log(chalk.cyan("Port must be between 1 and 65535"));
    process.exit(1);
  }

  let subdomain: string | undefined;
  const subdomainArg = remainingArgs.find((arg) =>
    arg.startsWith("--subdomain"),
  );
  if (subdomainArg) {
    if (subdomainArg.includes("=")) {
      // Format: --subdomain=value
      subdomain = subdomainArg.split("=")[1];
    } else {
      // Format: --subdomain value
      const subdomainIndex = remainingArgs.indexOf(subdomainArg);
      if (subdomainIndex !== -1 && remainingArgs[subdomainIndex + 1]) {
        subdomain = remainingArgs[subdomainIndex + 1];
      }
    }
  }

  const config = loadConfig(isDev);
  let apiKey = process.env.OUTRAY_API_KEY || config.token;

  const keyArg = remainingArgs.find((arg) => arg.startsWith("--key"));
  if (keyArg) {
    if (keyArg.includes("=")) {
      // Format: --key=value
      apiKey = keyArg.split("=")[1];
    } else {
      // Format: --key value
      const keyIndex = remainingArgs.indexOf(keyArg);
      if (keyIndex !== -1 && remainingArgs[keyIndex + 1]) {
        apiKey = remainingArgs[keyIndex + 1];
      }
    }
  }

  const client = new OutRayClient(localPort!, serverUrl, apiKey, subdomain);
  client.start();

  process.on("SIGINT", () => {
    console.log(chalk.cyan("\n👋 Shutting down gracefully..."));
    client.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log(chalk.cyan("\n👋 Shutting down gracefully..."));
    client.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(chalk.red("Unexpected error:"), err);
  process.exit(1);
});
