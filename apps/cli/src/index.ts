#!/usr/bin/env node

import chalk from "chalk";
import path from "path";
import { OutRayClient } from "./client";
import { TCPTunnelClient } from "./tcp-client";
import { UDPTunnelClient } from "./udp-client";
import { ConfigManager, OutRayConfig } from "./config";
import { AuthManager } from "./auth";
import { TomlConfigParser, ParsedTunnelConfig } from "./toml-config";
import { version } from "../package.json";
import type { ShadowOptions } from "@outray/core";

function getFlagValue(args: string[], flag: string): string | undefined {
  const match = args.find(
    (arg) => arg === flag || arg.startsWith(`${flag}=`),
  );
  if (!match) {
    return undefined;
  }
  if (match.includes("=")) {
    const [, value] = match.split("=", 2);
    return value;
  }
  const index = args.indexOf(match);
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }
  return next;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseShadowOptionsFromArgs(
  args: string[],
): ShadowOptions | undefined {
  const shadowPortValue = getFlagValue(args, "--shadow-port");
  if (!shadowPortValue) {
    return undefined;
  }

  const shadowPort = parseInt(shadowPortValue, 10);
  if (Number.isNaN(shadowPort) || shadowPort < 1 || shadowPort > 65535) {
    throw new Error("shadow-port must be a valid port (1-65535)");
  }

  const targetHost = getFlagValue(args, "--shadow-host") || "localhost";
  const targetProtocol =
    (getFlagValue(args, "--shadow-protocol") as "http" | "https" | undefined) ??
    "http";

  if (targetProtocol !== "http" && targetProtocol !== "https") {
    throw new Error("shadow-protocol must be http or https");
  }

  const sampleRateValue = getFlagValue(args, "--shadow-sample");
  const sampleRate = sampleRateValue ? parseFloat(sampleRateValue) : undefined;
  if (sampleRate !== undefined && (sampleRate < 0 || sampleRate > 1)) {
    throw new Error("shadow-sample must be between 0 and 1");
  }

  const timeoutValue = getFlagValue(args, "--shadow-timeout");
  const timeoutMs = timeoutValue ? parseInt(timeoutValue, 10) : undefined;

  const maxBodyValue = getFlagValue(args, "--shadow-max-body");
  const maxBodyBytes = maxBodyValue ? parseInt(maxBodyValue, 10) : undefined;

  const headerValue = getFlagValue(args, "--shadow-headers");
  const compareHeaders = headerValue
    ? headerValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  return {
    target: {
      host: targetHost,
      port: shadowPort,
      protocol: targetProtocol,
    },
    sampleRate,
    timeoutMs,
    maxBodyBytes,
    compareHeaders,
  };
}

async function handleLogin(
  configManager: ConfigManager,
  webUrl: string,
  isDev: boolean,
) {
  console.log(chalk.cyan(`\nOpening browser for authentication...`));

  const authManager = new AuthManager(webUrl);

  try {
    // Step 1: Initiate login session
    const session = await authManager.initiateLogin();

    console.log(
      chalk.dim(`\nIf browser doesn't open, visit:\n${session.loginUrl}\n`),
    );

    authManager.openBrowser(session.loginUrl);

    // Step 2: Poll for authentication
    console.log(chalk.dim("Waiting for authentication..."));
    const userToken = await authManager.pollLoginStatus(session.code);

    console.log(chalk.green("✓ Authenticated successfully"));

    // Step 3: Fetch organizations
    const authManagerWithToken = new AuthManager(webUrl, userToken);
    const orgs = await authManagerWithToken.fetchOrganizations();

    // Step 4: Select organization
    const selectedOrg = await authManagerWithToken.selectOrganization(orgs);

    // Step 5: Exchange token
    const { orgToken, expiresAt } = await authManagerWithToken.exchangeToken(
      selectedOrg.id,
    );

    // Step 6: Save config
    const config: OutRayConfig = {
      authType: "user",
      userToken,
      activeOrgId: selectedOrg.id,
      orgToken,
      orgTokenExpiresAt: expiresAt,
    };

    configManager.save(config);

    console.log(chalk.green(`\n✔ Logged in successfully`));
    console.log(chalk.dim(`✔ Active org: ${selectedOrg.slug}`));
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Login failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    );
    process.exit(1);
  }
}

async function handleSwitch(
  configManager: ConfigManager,
  config: OutRayConfig,
  webUrl: string,
  orgSlugArg?: string,
) {
  if (config.authType !== "user" || !config.userToken) {
    console.log(chalk.red("❌ Please login first with: outray login"));
    process.exit(1);
  }

  const authManager = new AuthManager(webUrl, config.userToken);

  try {
    const orgs = await authManager.fetchOrganizations();

    let selectedOrg;

    if (orgSlugArg) {
      // Find org by slug
      selectedOrg = orgs.find((org) => org.slug === orgSlugArg);
      if (!selectedOrg) {
        console.log(chalk.red(`❌ Organization "${orgSlugArg}" not found`));
        process.exit(1);
      }
    } else {
      // Interactive selection
      selectedOrg = await authManager.selectOrganization(orgs);
    }

    // Exchange token for new org
    const { orgToken, expiresAt } = await authManager.exchangeToken(
      selectedOrg.id,
    );

    // Update config
    config.activeOrgId = selectedOrg.id;
    config.orgToken = orgToken;
    config.orgTokenExpiresAt = expiresAt;

    configManager.save(config);

    console.log(chalk.green(`\n✔ Switched to: ${selectedOrg.slug}`));
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Switch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    );
    process.exit(1);
  }
}

async function handleWhoami(
  config: OutRayConfig,
  webUrl: string,
  isDev: boolean,
) {
  if (!config.userToken || !config.activeOrgId) {
    console.log(chalk.red("❌ Not logged in"));
    process.exit(1);
  }

  try {
    const authManager = new AuthManager(webUrl, config.userToken);
    const orgs = await authManager.fetchOrganizations();
    const activeOrg = orgs.find((org) => org.id === config.activeOrgId);

    if (!activeOrg) {
      console.log(chalk.red("❌ Active organization not found"));
      process.exit(1);
    }

    console.log(chalk.cyan(`\nAuthentication Status\n`));
    console.log(chalk.dim("Active Organization:"));
    console.log(`  ${activeOrg.name} (${activeOrg.slug})`);
    console.log(chalk.dim(`\nRole: ${activeOrg.role}`));

    if (orgs.length > 1) {
      console.log(
        chalk.dim(
          `\nYou have access to ${orgs.length} organizations. Use 'outray switch' to change.`,
        ),
      );
    }
  } catch (error) {
    console.log(
      chalk.red(
        `\n❌ Failed to fetch info: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    );
    process.exit(1);
  }
}

async function handleLogout(configManager: ConfigManager, isDev: boolean) {
  const config = configManager.load();

  if (!config) {
    console.log(chalk.yellow("⚠️  Not logged in"));
    return;
  }

  configManager.clear();

  console.log(chalk.green(`✔ Logged out successfully`));
}

async function ensureValidToken(
  configManager: ConfigManager,
  config: OutRayConfig,
  webUrl: string,
): Promise<string> {
  // User auth - ensure org token is valid
  if (config.authType === "user") {
    if (!config.userToken || !config.activeOrgId) {
      throw new Error("Invalid config state");
    }

    // Check if org token is still valid
    if (configManager.isOrgTokenValid(config)) {
      return config.orgToken!;
    }

    // Token expired - silently re-exchange
    console.log(chalk.dim("Refreshing authentication..."));
    const authManager = new AuthManager(webUrl, config.userToken);
    const { orgToken, expiresAt } = await authManager.exchangeToken(
      config.activeOrgId,
    );

    config.orgToken = orgToken;
    config.orgTokenExpiresAt = expiresAt;
    configManager.save(config);

    return orgToken;
  }

  throw new Error("No valid authentication found");
}

async function getOrgSlugForDisplay(
  config: OutRayConfig,
  webUrl: string,
): Promise<string | null> {
  if (config.authType !== "user" || !config.userToken || !config.activeOrgId) {
    return null;
  }

  try {
    const authManager = new AuthManager(webUrl, config.userToken);
    const orgs = await authManager.fetchOrganizations();
    const activeOrg = orgs.find((org) => org.id === config.activeOrgId);
    return activeOrg?.slug || null;
  } catch {
    return null;
  }
}

async function handleStartFromConfig(
  configManager: ConfigManager,
  webUrl: string,
  defaultServerUrl: string,
  configPath?: string,
) {
  const defaultConfigPath = path.join(process.cwd(), "outray", "config.toml");
  const tomlConfigPath = configPath || defaultConfigPath;

  let parsedConfig;
  try {
    parsedConfig = TomlConfigParser.loadTomlConfig(tomlConfigPath);
  } catch (error) {
    console.log(
      chalk.red(
        `Failed to load config: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    );
    process.exit(1);
  }

  // Use server_url from config if provided, otherwise use default
  const serverUrl = parsedConfig.global?.server_url || defaultServerUrl;

  const authConfig = configManager.load();
  if (!authConfig) {
    console.log(chalk.red("Not logged in. Run: outray login"));
    process.exit(1);
  }

  const clients: Array<OutRayClient | TCPTunnelClient | UDPTunnelClient> = [];

  for (const tunnel of parsedConfig.tunnels) {
    let apiKey: string | undefined;

    if (tunnel.org && authConfig.authType === "user" && authConfig.userToken) {
      const authManager = new AuthManager(webUrl, authConfig.userToken);
      const orgs = await authManager.fetchOrganizations();
      const org = orgs.find((o) => o.slug === tunnel.org);

      if (!org) {
        console.log(
          chalk.yellow(
            `Warning: Organization "${tunnel.org}" not found for tunnel "${tunnel.name}", using default org`,
          ),
        );
        try {
          apiKey = await ensureValidToken(configManager, authConfig, webUrl);
        } catch (error) {
          console.log(
            chalk.red(
              `Failed to get token for tunnel "${tunnel.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
            ),
          );
          continue;
        }
      } else {
        const { orgToken } = await authManager.exchangeToken(org.id);
        apiKey = orgToken;
      }
    } else {
      try {
        apiKey = await ensureValidToken(configManager, authConfig, webUrl);
      } catch (error) {
        console.log(
          chalk.red(
            `Failed to get token for tunnel "${tunnel.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
        continue;
      }
    }

    let client: OutRayClient | TCPTunnelClient | UDPTunnelClient;

    if (tunnel.protocol === "tcp") {
      client = new TCPTunnelClient(
        tunnel.localPort,
        serverUrl,
        apiKey,
        tunnel.localHost,
        tunnel.remotePort,
      );
    } else if (tunnel.protocol === "udp") {
      client = new UDPTunnelClient(
        tunnel.localPort,
        serverUrl,
        apiKey,
        tunnel.localHost,
        tunnel.remotePort,
      );
    } else {
      const shadowOptions = tunnel.shadow
        ? {
            target: {
              host: tunnel.shadow.target_host || "localhost",
              port: tunnel.shadow.target_port,
              protocol: tunnel.shadow.target_protocol || "http",
            },
            sampleRate: tunnel.shadow.sample_rate,
            timeoutMs: tunnel.shadow.timeout_ms,
            maxBodyBytes: tunnel.shadow.max_body_bytes,
            compareHeaders: tunnel.shadow.compare_headers,
          }
        : undefined;

      client = new OutRayClient(
        tunnel.localPort,
        serverUrl,
        apiKey,
        tunnel.subdomain,
        tunnel.customDomain,
        false,
        shadowOptions,
      );
    }

    clients.push(client);
    client.start();
  }

  if (clients.length === 0) {
    console.log(chalk.red("No tunnels could be started"));
    process.exit(1);
  }

  console.log(chalk.green(`\nStarted ${clients.length} tunnel(s) from config`));

  const shutdown = () => {
    console.log(chalk.cyan("\nShutting down gracefully..."));
    for (const client of clients) {
      client.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printHelp() {
  console.log(chalk.cyan("\nUsage:"));
  console.log(chalk.cyan("  outray login           Login via browser"));
  console.log(
    chalk.cyan("  outray start           Start tunnels from config.toml"),
  );
  console.log(chalk.cyan("  outray validate-config Validate config.toml file"));
  console.log(chalk.cyan("  outray <port>          Start HTTP tunnel"));
  console.log(chalk.cyan("  outray http <port>     Start HTTP tunnel"));
  console.log(chalk.cyan("  outray tcp <port>      Start TCP tunnel"));
  console.log(chalk.cyan("  outray udp <port>      Start UDP tunnel"));
  console.log(chalk.cyan("  outray switch [org]    Switch organization"));
  console.log(chalk.cyan("  outray whoami          Show current user"));
  console.log(chalk.cyan("  outray logout          Logout"));
  console.log(chalk.cyan("  outray version         Show version"));
  console.log(chalk.cyan("  outray help            Show this help message"));
  console.log(chalk.cyan("\nOptions:"));
  console.log(
    chalk.cyan(
      "  --config <path>        Path to config file (default: config.toml)",
    ),
  );
  console.log(chalk.cyan("  --org <slug>           Use specific org"));
  console.log(
    chalk.cyan("  --subdomain <name>     Custom subdomain (HTTP only)"),
  );
  console.log(chalk.cyan("  --domain <domain>      Custom domain (HTTP only)"));
  console.log(
    chalk.cyan("  --remote-port <port>   Remote port (TCP/UDP only)"),
  );
  console.log(chalk.cyan("  --key <token>          Override auth token"));
  console.log(
    chalk.cyan("  --no-logs              Disable tunnel request logs"),
  );
  console.log(chalk.cyan("  --shadow-port <port>   Mirror traffic to a local port (HTTP only)"));
  console.log(chalk.cyan("  --shadow-host <host>   Shadow target host (default: localhost)"));
  console.log(chalk.cyan("  --shadow-protocol <p>  Shadow target protocol: http|https"));
  console.log(chalk.cyan("  --shadow-sample <n>    Shadow sample rate 0-1 (default: 1)"));
  console.log(chalk.cyan("  --shadow-timeout <ms>  Shadow request timeout in ms"));
  console.log(chalk.cyan("  --shadow-max-body <b>  Shadow body cap in bytes"));
  console.log(chalk.cyan("  --shadow-headers <h>   Comma list of headers to diff"));
  console.log(chalk.cyan("  --dev                  Use dev environment"));
  console.log(chalk.cyan("  -v, --version          Show version"));
  console.log(chalk.cyan("  -h, --help             Show this help message"));
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
    (isDev ? "http://localhost:3000" : "https://outray.dev");

  const configManager = new ConfigManager(isDev);

  if (command === "version" || command === "-v" || command === "--version") {
    console.log(`outray version ${version}`);
    return;
  }

  if (command === "help" || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  // Handle commands that don't require a tunnel
  if (command === "login") {
    await handleLogin(configManager, webUrl, isDev);
    return;
  }

  if (command === "logout") {
    await handleLogout(configManager, isDev);
    return;
  }

  if (command === "switch") {
    const config = configManager.load();
    if (!config) {
      console.log(chalk.red("❌ Not logged in. Run: outray login"));
      process.exit(1);
    }
    const orgSlug = args[1];
    await handleSwitch(configManager, config, webUrl, orgSlug);
    return;
  }

  if (command === "whoami") {
    const config = configManager.load();
    if (!config) {
      console.log(chalk.red("❌ Not logged in. Run: outray login"));
      process.exit(1);
    }
    await handleWhoami(config, webUrl, isDev);
    return;
  }

  if (command === "start") {
    const configPath = getFlagValue(args, "--config");
    await handleStartFromConfig(configManager, webUrl, serverUrl, configPath);
    return;
  }

  if (command === "validate-config" || command === "validate") {
    const configPath = getFlagValue(args, "--config");

    const defaultConfigPath = path.join(process.cwd(), "outray", "config.toml");
    const tomlConfigPath = configPath || defaultConfigPath;

    try {
      const parsedConfig = TomlConfigParser.loadTomlConfig(tomlConfigPath);
      console.log(chalk.green(`✓ Config file is valid`));
      
      if (parsedConfig.global?.server_url) {
        console.log(chalk.cyan(`\nServer URL: ${parsedConfig.global.server_url}`));
      }
      
      console.log(
        chalk.cyan(`\nFound ${parsedConfig.tunnels.length} tunnel(s):\n`),
      );
      for (const tunnel of parsedConfig.tunnels) {
        console.log(chalk.dim(`  [${tunnel.name}]`));
        console.log(`    Protocol: ${tunnel.protocol}`);
        console.log(`    Local: ${tunnel.localHost}:${tunnel.localPort}`);
        if (tunnel.subdomain) {
          console.log(`    Subdomain: ${tunnel.subdomain}`);
        }
        if (tunnel.customDomain) {
          console.log(`    Custom Domain: ${tunnel.customDomain}`);
        }
        if (tunnel.remotePort) {
          console.log(`    Remote Port: ${tunnel.remotePort}`);
        }
        if (tunnel.org) {
          console.log(`    Org: ${tunnel.org}`);
        }
        if (tunnel.shadow) {
          console.log(
            `    Shadow: ${tunnel.shadow.target_protocol || "http"}://${tunnel.shadow.target_host || "localhost"}:${tunnel.shadow.target_port}`,
          );
        }
        console.log();
      }
    } catch (error) {
      console.log(
        chalk.red(
          `✗ Config validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
      process.exit(1);
    }
    return;
  }

  if (!command) {
    console.log(chalk.red("❌ Please specify a command"));
    printHelp();
    process.exit(1);
  }

  // Parse tunnel command
  let localPort: number;
  let remainingArgs: string[];
  let tunnelProtocol: "http" | "tcp" | "udp" = "http";

  if (command === "http") {
    const portArg = args[1];
    if (!portArg) {
      console.log(chalk.red("❌ Please specify a port"));
      console.log(chalk.cyan("Usage: outray http <port>"));
      process.exit(1);
    }
    localPort = parseInt(portArg, 10);
    remainingArgs = args.slice(2);
    tunnelProtocol = "http";
  } else if (command === "tcp") {
    const portArg = args[1];
    if (!portArg) {
      console.log(chalk.red("❌ Please specify a port"));
      console.log(chalk.cyan("Usage: outray tcp <port>"));
      process.exit(1);
    }
    localPort = parseInt(portArg, 10);
    remainingArgs = args.slice(2);
    tunnelProtocol = "tcp";
  } else if (command === "udp") {
    const portArg = args[1];
    if (!portArg) {
      console.log(chalk.red("❌ Please specify a port"));
      console.log(chalk.cyan("Usage: outray udp <port>"));
      process.exit(1);
    }
    localPort = parseInt(portArg, 10);
    remainingArgs = args.slice(2);
    tunnelProtocol = "udp";
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

  const subdomain = getFlagValue(remainingArgs, "--subdomain");
  const customDomain = getFlagValue(remainingArgs, "--domain");

  // Handle --remote-port flag for TCP/UDP tunnels
  const remotePortValue = getFlagValue(remainingArgs, "--remote-port");
  const remotePort = remotePortValue ? parseInt(remotePortValue, 10) : undefined;

  // Handle --org flag for temporary org override
  let tempOrgSlug: string | undefined;
  const orgValue = getFlagValue(remainingArgs, "--org");
  if (orgValue) {
    tempOrgSlug = orgValue;
  }

  // Handle --no-logs flag to disable tunnel request logs
  const noLogs = hasFlag(remainingArgs, "--no-logs");

  let shadowOptions: ShadowOptions | undefined;
  try {
    shadowOptions = parseShadowOptionsFromArgs(remainingArgs);
  } catch (error) {
    console.log(
      chalk.red(
        `❌ ${error instanceof Error ? error.message : "Invalid shadow options"}`,
      ),
    );
    process.exit(1);
  }

  if (shadowOptions && tunnelProtocol !== "http") {
    console.log(chalk.red("❌ Shadow traffic is only supported for HTTP tunnels"));
    process.exit(1);
  }

  // Load and validate config
  let config = configManager.load();

  if (!config) {
    console.log(chalk.red("❌ Not logged in. Run: outray login"));
    process.exit(1);
  }

  // Handle temporary org override
  if (tempOrgSlug && config.authType === "user" && config.userToken) {
    const authManager = new AuthManager(webUrl, config.userToken);
    const orgs = await authManager.fetchOrganizations();
    const tempOrg = orgs.find((org) => org.slug === tempOrgSlug);

    if (!tempOrg) {
      console.log(chalk.red(`❌ Organization "${tempOrgSlug}" not found`));
      process.exit(1);
    }

    // Exchange token for temporary org (don't save to config)
    const { orgToken } = await authManager.exchangeToken(tempOrg.id);
    config = {
      ...config,
      orgToken,
      activeOrgId: tempOrg.id,
    };

    console.log(chalk.dim(`Using organization: ${tempOrg.slug} (temporary)\n`));
  }

  // Get API key/token
  let apiKey: string | undefined;

  const keyValue = getFlagValue(remainingArgs, "--key");
  if (keyValue) {
    apiKey = keyValue;
  } else {
    // Ensure we have a valid token
    try {
      apiKey = await ensureValidToken(configManager, config, webUrl);
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Authentication error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      );
      console.log(chalk.cyan("Try running: outray login"));
      process.exit(1);
    }
  }

  // Show active org (unless using --org override or --key override)
  if (!tempOrgSlug && !keyValue) {
    const orgSlug = await getOrgSlugForDisplay(config, webUrl);
    if (orgSlug) {
      console.log(chalk.dim(`Org: ${orgSlug}`));
    }
  }

  let client: OutRayClient | TCPTunnelClient | UDPTunnelClient;

  if (tunnelProtocol === "tcp") {
    client = new TCPTunnelClient(
      localPort!,
      serverUrl,
      apiKey,
      "localhost",
      remotePort,
      noLogs,
    );
  } else if (tunnelProtocol === "udp") {
    client = new UDPTunnelClient(
      localPort!,
      serverUrl,
      apiKey,
      "localhost",
      remotePort,
      noLogs,
    );
  } else {
    client = new OutRayClient(
      localPort!,
      serverUrl,
      apiKey,
      subdomain,
      customDomain,
      noLogs,
      shadowOptions,
    );
  }

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
