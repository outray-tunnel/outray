const DEFAULT_DASHBOARD_URL = "https://beta.outray.dev";

export const SITE_URL = "https://outray.co";

function normalizePublicUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function normalizeOptionalPublicUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function dashboardLink(pathname: string): string {
  return new URL(pathname, `${DASHBOARD_URL}/`).toString();
}

export const DASHBOARD_URL = normalizePublicUrl(
  import.meta.env.PUBLIC_DASHBOARD_URL,
  DEFAULT_DASHBOARD_URL,
);

export const siteLinks = Object.freeze({
  signup: dashboardLink("signup"),
  login: dashboardLink("login"),
  docs: dashboardLink("docs"),
  privacy: dashboardLink("privacy"),
  terms: dashboardLink("terms"),
  github: "https://github.com/outray-tunnel/outray",
  status: "https://status.outray.dev",
});

export const SITE_LINKS = siteLinks;

const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY?.trim() || undefined;
const posthogHost = normalizeOptionalPublicUrl(import.meta.env.PUBLIC_POSTHOG_HOST);

export const POSTHOG_CONFIG = Object.freeze({
  key: posthogKey,
  host: posthogHost,
  enabled: Boolean(posthogKey),
});
