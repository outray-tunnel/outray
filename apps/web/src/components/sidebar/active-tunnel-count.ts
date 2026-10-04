export function activeTunnelCountLabel(count?: number): string | undefined {
  if (count === undefined || !Number.isSafeInteger(count) || count <= 0) {
    return undefined;
  }
  return `${count.toLocaleString()} active ${count === 1 ? "tunnel" : "tunnels"}`;
}
