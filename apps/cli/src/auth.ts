import chalk from "chalk";
import { exec } from "child_process";
import prompts from "prompts";

interface LoginSession {
  loginUrl: string;
  code: string;
  expiresIn: number;
}

interface LoginStatus {
  status: "pending" | "authenticated" | "expired";
  userToken?: string;
}

interface Organization {
  id: string;
  slug: string;
  name: string;
  role: string;
}

interface ExchangeResponse {
  orgToken: string;
  expiresAt: string;
}

export class AuthManager {
  constructor(
    private webUrl: string,
    private userToken?: string,
  ) {}

  async initiateLogin(): Promise<LoginSession> {
    const response = await fetch(`${this.webUrl}/api/cli/login`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate login: ${response.status}`);
    }

    return (await response.json()) as LoginSession;
  }

  async pollLoginStatus(code: string): Promise<string> {
    const maxAttempts = 60; // 5 minutes (5s intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `${this.webUrl}/api/cli/login/status?code=${code}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to check login status: ${response.status}`);
      }

      const status = (await response.json()) as LoginStatus;

      if (status.status === "authenticated" && status.userToken) {
        return status.userToken;
      }

      if (status.status === "expired") {
        throw new Error("Login session expired");
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error("Login timeout");
  }

  async fetchOrganizations(): Promise<Organization[]> {
    if (!this.userToken) {
      throw new Error("No user token available");
    }

    const response = await fetch(`${this.webUrl}/api/me/orgs`, {
      headers: {
        Authorization: `Bearer ${this.userToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch organizations: ${response.status}`);
    }

    return (await response.json()) as Organization[];
  }

  async exchangeToken(orgId: string): Promise<ExchangeResponse> {
    if (!this.userToken) {
      throw new Error("No user token available");
    }

    const response = await fetch(`${this.webUrl}/api/cli/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.userToken}`,
      },
      body: JSON.stringify({ orgId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange token: ${response.status}`);
    }

    return (await response.json()) as ExchangeResponse;
  }

  async selectOrganization(orgs: Organization[]): Promise<Organization> {
    if (orgs.length === 0) {
      throw new Error("No organizations found");
    }

    if (orgs.length === 1) {
      console.log(chalk.dim(`Auto-selecting organization: ${orgs[0].slug}`));
      return orgs[0];
    }

    console.log(chalk.cyan("\n🏢 Select an organization:"));

    const response = await prompts({
      type: "select",
      name: "org",
      message: "Organization",
      choices: orgs.map((org) => ({
        title: `${org.name} (${org.slug})`,
        value: org.id,
      })),
    });

    const selected = orgs.find((org) => org.id === response.org);
    if (!selected) {
      throw new Error("No organization selected");
    }

    return selected;
  }

  openBrowser(url: string): void {
    const platform = process.platform;
    const command =
      platform === "darwin"
        ? `open "${url}"`
        : platform === "win32"
          ? `cmd /c start "" "${url}"`
          : `xdg-open "${url}"`;

    exec(command, (error) => {
      if (error) {
        console.log(chalk.yellow("⚠️  Could not open browser automatically"));
      }
    });
  }
}
