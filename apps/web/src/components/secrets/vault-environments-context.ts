import { createContext, useContext } from "react";
import type { SecretProject } from "@/lib/secrets-client";

export interface VaultEnvironmentsContextValue {
  project: SecretProject;
  actionsContainer: HTMLElement | null;
  reloadProject: () => void;
}

export const VaultEnvironmentsContext = createContext<VaultEnvironmentsContextValue | null>(null);

export function useVaultEnvironmentsLayout() {
  const context = useContext(VaultEnvironmentsContext);
  if (!context) throw new Error("Environment keys must be rendered inside their shared vault layout.");
  return context;
}
