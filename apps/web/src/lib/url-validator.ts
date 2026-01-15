/**
 * URL validation utility to prevent SSRF (Server-Side Request Forgery) attacks
 */

// Private IP ranges that should be blocked (CIDR notation converted to regex)
const PRIVATE_IP_RANGES = [
  /^127\./, // 127.0.0.0/8 (loopback)
  /^10\./, // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
  /^192\.168\./, // 192.168.0.0/16 (private)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8 (current network)
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (carrier-grade NAT)
  /^192\.0\.0\./, // 192.0.0.0/24 (IETF Protocol Assignments)
  /^192\.0\.2\./, // 192.0.2.0/24 (TEST-NET-1)
  /^192\.88\.99\./, // 192.88.99.0/24 (6to4 relay anycast)
  /^198\.(1[8-9])\./, // 198.18.0.0/15 (benchmarking)
  /^198\.51\.100\./, // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./, // 203.0.113.0/24 (TEST-NET-3)
  /^(22[4-9]|23\d)\./, // 224.0.0.0/4 (multicast, 224-239)
  /^240\./, // 240.0.0.0/4 (reserved)
  /^255\.255\.255\.255$/, // broadcast
];

// IPv6 private/special addresses
const PRIVATE_IPV6_PATTERNS = [
  /^::1$/, // loopback
  /^::$/, // unspecified
  /^::ffff:/, // IPv4-mapped IPv6
  /^fe80:/, // link-local
  /^fc00:/, // unique local
  /^fd00:/, // unique local
  /^ff00:/, // multicast
];

// Allowed protocols
const ALLOWED_PROTOCOLS = ["http:", "https:"];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a string is a valid IPv4 address
 */
function isIPv4(str: string): boolean {
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = str.match(ipv4Pattern);

  if (!match) return false;

  // Check that each octet is 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return false;
  }

  return true;
}

/**
 * Check if a string is a valid IPv6 address
 * Note: This is a simplified validation that covers most IPv6 formats.
 * For production use with complex IPv6 scenarios, consider using a dedicated library.
 */
function isIPv6(str: string): boolean {
  // IPv6 addresses contain colons and hex digits
  if (!str.includes(":")) {
    return false;
  }

  // Basic validation: check for valid hex segments separated by colons
  // Handles standard format (8 groups of 4 hex digits) and compressed format (::)
  const segments = str.split(":");

  // IPv6 should have 2-8 segments (compressed format can have fewer)
  if (segments.length < 2 || segments.length > 8) {
    return false;
  }

  // Check if it contains "::" (compression)
  const hasCompression = str.includes("::");

  // Each non-empty segment should be 1-4 hex digits
  for (const segment of segments) {
    if (segment.length > 0) {
      if (segment.length > 4 || !/^[0-9a-fA-F]+$/.test(segment)) {
        return false;
      }
    }
  }

  // If no compression, must have exactly 8 segments
  if (!hasCompression && segments.length !== 8) {
    return false;
  }

  return true;
}

/**
 * Check if an IP address is private or special-use
 */
function isPrivateIP(ip: string): boolean {
  // Check IPv4
  if (isIPv4(ip)) {
    return PRIVATE_IP_RANGES.some((pattern) => pattern.test(ip));
  }

  // Check IPv6
  if (isIPv6(ip)) {
    const normalizedIp = ip.toLowerCase();
    return PRIVATE_IPV6_PATTERNS.some((pattern) => pattern.test(normalizedIp));
  }

  return false;
}

/**
 * Check if hostname is localhost
 */
function isLocalhost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "[::1]"
  );
}

/**
 * Check if hostname looks suspicious (potential DNS rebinding)
 */
function isSuspiciousHostname(hostname: string): boolean {
  // Block hostnames that are just IP addresses in different formats
  // e.g., 0x7f000001 (hex), 2130706433 (decimal)
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    return true;
  }

  if (/^\d+$/.test(hostname)) {
    return true;
  }

  // Block single-part hostnames (no dots) as they're often suspicious
  // This prevents things like "localhost" variations that aren't caught elsewhere
  if (!hostname.includes(".") && !hostname.startsWith("[")) {
    return true;
  }

  return false;
}

/**
 * Validate URL to prevent SSRF attacks
 */
export function validateUrl(urlString: string): UrlValidationResult {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch (error) {
    return {
      valid: false,
      error: "Invalid URL format",
    };
  }

  // Check protocol
  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Protocol "${parsedUrl.protocol}" is not allowed. Only http and https are supported.`,
    };
  }

  const hostname = parsedUrl.hostname;

  // Check for localhost
  if (isLocalhost(hostname)) {
    return {
      valid: false,
      error: "Requests to localhost are not allowed",
    };
  }

  // Check for suspicious hostnames that might be DNS rebinding attempts
  if (isSuspiciousHostname(hostname)) {
    return {
      valid: false,
      error: "Hostname format is not allowed",
    };
  }

  // IPv6 addresses in URLs are wrapped in brackets, e.g., [::1]
  // Remove brackets for validation
  const ipAddress = hostname.replace(/^\[|\]$/g, "");

  // Check if hostname is an IP address and if so, check if it's private
  if (isIPv4(ipAddress) || isIPv6(ipAddress)) {
    if (isPrivateIP(ipAddress)) {
      return {
        valid: false,
        error: "Requests to private IP addresses are not allowed",
      };
    }
  }

  // Note: This validation cannot prevent DNS rebinding attacks where a domain
  // name initially resolves to a public IP but later resolves to a private IP.
  // Full protection would require DNS resolution at request time, which is not
  // implemented here due to the synchronous nature of this validation.
  // Additional mitigation: rely on network-level controls and rate limiting.

  return {
    valid: true,
  };
}
