interface SetupEndpoints {
  mode?: string;
  consoleUrl?: string;
  tunnelUrl?: string;
  ingestUrl?: string;
}

const buildEndpoints: SetupEndpoints = {
  mode: import.meta.env?.PUBLIC_OUTRAY_DEPLOYMENT_MODE,
  consoleUrl: import.meta.env?.PUBLIC_DASHBOARD_URL || import.meta.env?.VITE_APP_URL,
  tunnelUrl: import.meta.env?.VITE_TUNNEL_URL,
  ingestUrl: import.meta.env?.VITE_OUTRAY_INGEST_URL,
};

function endpointOrigin(value: string | undefined, name: string, websocket = false): string {
  if (!value) throw new Error(`${name} is required for self-hosted setup instructions`);
  const url = new URL(value);
  const protocols = websocket ? ["http:", "https:", "ws:", "wss:"] : ["http:", "https:"];
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`${name} must be a public origin without credentials, a path or query`);
  }
  if (websocket) url.protocol = ["https:", "wss:"].includes(url.protocol) ? "wss:" : "ws:";
  return url.origin;
}

const shellValue = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Both overrides are necessary: console authentication and the tunnel edge
 * belong to the same installation. Hosted command examples remain unchanged. */
export function setupCliCommand(command: string, endpoints: SetupEndpoints = buildEndpoints): string {
  if (endpoints.mode !== "self-hosted") return command;
  const consoleOrigin = endpointOrigin(endpoints.consoleUrl, "PUBLIC_DASHBOARD_URL");
  const tunnelOrigin = endpointOrigin(endpoints.tunnelUrl, "VITE_TUNNEL_URL", true);
  return `OUTRAY_WEB_URL=${shellValue(consoleOrigin)} OUTRAY_SERVER_URL=${shellValue(tunnelOrigin)} ${command}`;
}

export function observabilitySetupCode(code: string, endpoints: SetupEndpoints = buildEndpoints): string {
  if (!endpoints.ingestUrl) return code;
  const endpoint = endpointOrigin(endpoints.ingestUrl, "VITE_OUTRAY_INGEST_URL");
  return code.replace(/^([ \t]*)apiKey: "outray_your_ingest_token",$/m, (line, indent: string) =>
    `${line}\n${indent}endpoint: ${JSON.stringify(endpoint)},`,
  );
}
