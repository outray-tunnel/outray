import { createServerFn } from "@tanstack/react-start";
import { instanceConfig } from "../../../../shared/instance-config";

export const getPublicInstanceConfig = createServerFn({ method: "GET" }).handler(() => {
  const { selfHosted, products, billingEnabled } = instanceConfig();
  return {
    selfHosted, products, billingEnabled,
    authProviders: [
      ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? ["github" as const] : []),
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? ["google" as const] : []),
    ],
  };
});
