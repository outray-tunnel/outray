export type TunnelAddressMode = "random" | "subdomain" | "domain";
import { setupCliCommand } from "./onboarding/setup-endpoints";

const subdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const domainPattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isValidLocalPort(value: string): boolean {
  if (!/^\d{1,5}$/.test(value)) return false;
  const port = Number(value);
  return port >= 1 && port <= 65535;
}

export function isValidTunnelAddress(
  mode: TunnelAddressMode,
  value: string,
): boolean {
  if (mode === "random") return true;
  const address = value.trim();
  return mode === "subdomain"
    ? subdomainPattern.test(address)
    : domainPattern.test(address);
}

function shellArgument(value: string): string {
  return /^[a-zA-Z0-9._/-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildNewTunnelCommand({
  orgSlug,
  port,
  addressMode = "random",
  address = "",
}: {
  orgSlug: string;
  port: string;
  addressMode?: TunnelAddressMode;
  address?: string;
}): string | null {
  if (!orgSlug || !isValidLocalPort(port)) return null;
  if (!isValidTunnelAddress(addressMode, address)) return null;

  const command = `outray ${Number(port)} --org ${shellArgument(orgSlug)}`;
  if (addressMode === "random") return setupCliCommand(command);
  const flag = addressMode === "subdomain" ? "--subdomain" : "--domain";
  return setupCliCommand(`${command} ${flag} ${shellArgument(address.trim())}`);
}
