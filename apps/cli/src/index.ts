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
  serverUrl: string,
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
        tunnel.ipAllowlist
      );
    } else if (tunnel.protocol === "udp") {
      client = new UDPTunnelClient(
        tunnel.localPort,
        serverUrl,
        apiKey,
        tunnel.localHost,
        tunnel.remotePort,
        tunnel.ipAllowlist
      );
    } else {
      client = new OutRayClient(
        tunnel.localPort,
        serverUrl,
        apiKey,
        tunnel.subdomain,
        tunnel.customDomain,
        tunnel.ipAllowlist
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
  console.log(chalk.cyan("  --dev                  Use dev environment"));
  console.log(chalk.cyan("  --ip <ip/cidr>         Allow IP or CIDR (repeatable)"));
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
    const configArg = args.find((arg) => arg.startsWith("--config"));
    let configPath: string | undefined;
    if (configArg) {
      if (configArg.includes("=")) {
        configPath = configArg.split("=")[1];
      } else {
        const configIndex = args.indexOf(configArg);
        if (configIndex !== -1 && args[configIndex + 1]) {
          configPath = args[configIndex + 1];
        }
      }
    }
    await handleStartFromConfig(configManager, webUrl, serverUrl, configPath);
    return;
  }

  if (command === "validate-config" || command === "validate") {
    const configArg = args.find((arg) => arg.startsWith("--config"));
    let configPath: string | undefined;
    if (configArg) {
      if (configArg.includes("=")) {
        configPath = configArg.split("=")[1];
      } else {
        const configIndex = args.indexOf(configArg);
        if (configIndex !== -1 && args[configIndex + 1]) {
          configPath = args[configIndex + 1];
        }
      }
    }

    const defaultConfigPath = path.join(process.cwd(), "outray", "config.toml");
    const tomlConfigPath = configPath || defaultConfigPath;

    try {
      const parsedConfig = TomlConfigParser.loadTomlConfig(tomlConfigPath);
      console.log(chalk.green(`✓ Config file is valid`));
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

  let subdomain: string | undefined;
  const subdomainArg = remainingArgs.find((arg) =>
    arg.startsWith("--subdomain"),
  );
  if (subdomainArg) {
    if (subdomainArg.includes("=")) {
      subdomain = subdomainArg.split("=")[1];
    } else {
      const subdomainIndex = remainingArgs.indexOf(subdomainArg);
      if (subdomainIndex !== -1 && remainingArgs[subdomainIndex + 1]) {
        subdomain = remainingArgs[subdomainIndex + 1];
      }
    }
  }

  let customDomain: string | undefined;
  const domainArg = remainingArgs.find((arg) => arg.startsWith("--domain"));
  if (domainArg) {
    if (domainArg.includes("=")) {
      customDomain = domainArg.split("=")[1];
    } else {
      const domainIndex = remainingArgs.indexOf(domainArg);
      if (domainIndex !== -1 && remainingArgs[domainIndex + 1]) {
        customDomain = remainingArgs[domainIndex + 1];
      }
    }
  }

  // Handle --remote-port flag for TCP/UDP tunnels
  let remotePort: number | undefined;
  const remotePortArg = remainingArgs.find((arg) =>
    arg.startsWith("--remote-port"),
  );
  if (remotePortArg) {
    if (remotePortArg.includes("=")) {
      remotePort = parseInt(remotePortArg.split("=")[1], 10);
    } else {
      const remotePortIndex = remainingArgs.indexOf(remotePortArg);
      if (remotePortIndex !== -1 && remainingArgs[remotePortIndex + 1]) {
        remotePort = parseInt(remainingArgs[remotePortIndex + 1], 10);
      }
    }
  }

  // Handle --org flag for temporary org override
  const orgArg = remainingArgs.find((arg) => arg.startsWith("--org"));
  let tempOrgSlug: string | undefined;
  if (orgArg) {
    if (orgArg.includes("=")) {
      tempOrgSlug = orgArg.split("=")[1];
    } else {
      const orgIndex = remainingArgs.indexOf(orgArg);
      if (orgIndex !== -1 && remainingArgs[orgIndex + 1]) {
        tempOrgSlug = remainingArgs[orgIndex + 1];
      }
    }
  }

  // Handle --no-logs flag to disable tunnel request logs
  const noLogs = remainingArgs.includes("--no-logs");

  // Handle --ip flag for IP allowlisting (repeatable)
  const ipAllowlist: string[] = [];
  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];

    if (arg === "--ip" && remainingArgs[i + 1]) {
      ipAllowlist.push(remainingArgs[i + 1]);
      i++;
    } else if (arg.startsWith("--ip=")) {
      const value = arg.split("=")[1];
      if (value) {
        ipAllowlist.push(value);
      }
    }
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

  const keyArg = remainingArgs.find((arg) => arg.startsWith("--key"));
  if (keyArg) {
    if (keyArg.includes("=")) {
      apiKey = keyArg.split("=")[1];
    } else {
      const keyIndex = remainingArgs.indexOf(keyArg);
      if (keyIndex !== -1 && remainingArgs[keyIndex + 1]) {
        apiKey = remainingArgs[keyIndex + 1];
      }
    }
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
  if (!tempOrgSlug && !keyArg) {
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
      ipAllowlist,
      noLogs
    );
  } else if (tunnelProtocol === "udp") {
    client = new UDPTunnelClient(
      localPort!,
      serverUrl,
      apiKey,
      "localhost",
      remotePort,
      ipAllowlist,
      noLogs
    );
  } else {
    client = new OutRayClient(
      localPort!,
      serverUrl,
      apiKey,
      subdomain,
      customDomain,
      ipAllowlist,
      noLogs
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
