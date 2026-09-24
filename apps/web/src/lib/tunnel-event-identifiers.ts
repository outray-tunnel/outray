interface TunnelEventIdentity {
  id: string;
  url: string;
  name: string | null;
}

export function getTunnelEventIdentifiers(
  tunnel: TunnelEventIdentity,
): string[] {
  const identifiers = new Set<string>([tunnel.id]);

  if (tunnel.name) {
    identifiers.add(tunnel.name.toLowerCase());
  }

  try {
    identifiers.add(new URL(tunnel.url).hostname.toLowerCase());
  } catch {
    // The database UUID remains a safe fallback for malformed legacy URLs.
  }

  return Array.from(identifiers);
}
