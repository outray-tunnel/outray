function requiredPublicUrl(value: string | undefined, name: string): string {
  const candidate = value?.trim();
  if (!candidate) {
    throw new Error(`${name} must be set for the OutRay website.`);
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported URL protocol");
    }

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
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

export const SITE_URL = requiredPublicUrl(
  import.meta.env.PUBLIC_SITE_URL,
  "PUBLIC_SITE_URL",
);

export const DASHBOARD_URL = requiredPublicUrl(
  import.meta.env.PUBLIC_DASHBOARD_URL,
  "PUBLIC_DASHBOARD_URL",
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
