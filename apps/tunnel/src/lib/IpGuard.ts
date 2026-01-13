import ipRangeCheck from "ip-range-check";

export class IpGuard {
  /**
   * Normalizes an IP address to a standard IPv4 or IPv6 format.
   */
  static normalizeIp(ip?: string | null): string {
    if (!ip) return "0.0.0.0";

    let normalized = ip;

    if (normalized.includes(",")) {
      normalized = normalized.split(",")[0].trim();
    }
    if (normalized.startsWith("::ffff:")) {
      normalized = normalized.substring(7);
    }
    if (normalized === "::1") {
      normalized = "127.0.0.1";
    }

    return normalized;
  }

  /**
   * Checks if an IP address is allowed based on the provided allowlist.
   */
  static isAllowed(ip: string, allowlist?: string[]): boolean {
    if (!allowlist || allowlist.length === 0) {
      return true;
    }

    const normalizedIp = IpGuard.normalizeIp(ip);
    return ipRangeCheck(normalizedIp, allowlist);
  }
}
