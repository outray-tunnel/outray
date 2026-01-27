/**
 * Geolocation utilities
 *
 * Detects user's country from IP to show NGN payment option for Nigerian users.
 */

const CACHE_KEY = "outray_country_code";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedCountry {
  code: string;
  timestamp: number;
}

/**
 * Get cached country code from localStorage
 */
function getCachedCountry(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedCountry = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;

    if (isExpired) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed.code;
  } catch {
    return null;
  }
}

/**
 * Cache country code in localStorage
 */
function setCachedCountry(code: string): void {
  if (typeof window === "undefined") return;

  try {
    const cached: CachedCountry = {
      code,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage might be unavailable
  }
}

/**
 * Detect user's country from IP address
 * Uses ipapi.co free tier (1000 requests/day)
 */
export async function getUserCountry(): Promise<string | null> {
  // Check cache first
  const cached = getCachedCountry();
  if (cached) return cached;

  try {
    const res = await fetch("https://ipapi.co/country_code/", {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!res.ok) return null;

    const code = await res.text();
    const countryCode = code.trim().toUpperCase();

    // Cache the result
    setCachedCountry(countryCode);

    return countryCode;
  } catch (error) {
    console.warn("[Geolocation] Failed to detect country:", error);
    return null;
  }
}

/**
 * Check if user is in Nigeria
 */
export async function isNigerianUser(): Promise<boolean> {
  const country = await getUserCountry();
  return country === "NG";
}

/**
 * Clear cached country (useful for testing)
 */
export function clearCountryCache(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // localStorage might be unavailable
  }
}
