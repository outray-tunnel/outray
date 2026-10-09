import { createContext, useContext } from "react";
import type { getPublicInstanceConfig } from "./instance";

export type PublicInstanceConfig = Awaited<ReturnType<typeof getPublicInstanceConfig>>;
export const InstanceContext = createContext<PublicInstanceConfig>({
  selfHosted: false, billingEnabled: true,
  products: ["tunnels", "observability", "secrets", "uptime"],
  authProviders: ["github", "google"],
});
export const useInstance = () => useContext(InstanceContext);
