export function shareConfig(environment: NodeJS.ProcessEnv = process.env) {
  const publicOrigin = environment.SHARE_PUBLIC_ORIGIN || "http://localhost:4324";
  const url = new URL(publicOrigin);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password ||
      (environment.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("SHARE_PUBLIC_ORIGIN must be a bare HTTPS origin in production");
  }
  if (environment.NODE_ENV === "production" && (!environment.SHARE_PUBLIC_ORIGIN || !environment.SHARE_RATE_LIMIT_SECRET || environment.SHARE_RATE_LIMIT_SECRET.length < 32)) {
    throw new Error("SHARE_PUBLIC_ORIGIN and a 32-character SHARE_RATE_LIMIT_SECRET are required in production");
  }
  return {
    publicOrigin: url.origin,
    rateLimitSecret: environment.SHARE_RATE_LIMIT_SECRET || "local-development-only",
    clientIpHeader: environment.SHARE_CLIENT_IP_HEADER || "",
  };
}
