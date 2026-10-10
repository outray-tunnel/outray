import { createServerFn } from "@tanstack/react-start";
import { instanceConfig } from "../../../../shared/instance-config";
import { publicOrigin } from "../../../../shared/public-hosts";

export const getPublicInstanceConfig = createServerFn({ method: "GET" }).handler(() => {
  const { selfHosted, products, billingEnabled } = instanceConfig();
  const consoleUrl = process.env.CONSOLE_PUBLIC_URL || process.env.APP_URL ||
    process.env.BETTER_AUTH_URL || (!selfHosted ? "https://outray.dev" : undefined);
  if (!consoleUrl) {
    throw new Error("CONSOLE_PUBLIC_URL is required for a self-hosted console");
  }
  const workspaceUrlPrefix = `${publicOrigin(consoleUrl, "CONSOLE_PUBLIC_URL").host}/`;
  return {
    selfHosted, products, billingEnabled, workspaceUrlPrefix,
    authProviders: [
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? ["github" as const] : []),
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ["google" as const] : []),
    ],
  };
});
