export const productIds = ["tunnels", "observability", "secrets", "uptime"] as const;

export type ProductId = (typeof productIds)[number];

type ProductContent = {
  name: string;
  number: string;
  title: string;
  description: string;
  summary: string;
  tags: readonly string[];
  workflow: {
    title: string;
    description: string;
    steps: readonly { title: string; description: string }[];
    label: string;
    code: string;
    note: string;
  };
  capabilities: readonly { title: string; description: string }[];
  useCases: readonly { title: string; description: string }[];
  next: ProductId;
  connection: string;
};

export const products: Record<ProductId, ProductContent> = {
  tunnels: {
    name: "Tunnels",
    number: "01",
    title: "Give your local service a public address.",
    description: "Share a development server, receive a real webhook, or connect to a TCP service. OutRay forwards traffic to localhost while you keep working in your own environment.",
    summary: "A public URL for the service running on your machine.",
    tags: ["HTTP · TCP · UDP", "Custom domains", "Request inspection"],
    workflow: {
      title: "From local to reachable.",
      description: "Keep your existing development server. Add the CLI, authenticate, and open a tunnel to its port.",
      steps: [
        { title: "Run your service", description: "Start your app on localhost, just as you normally would." },
        { title: "Open a tunnel", description: "Point OutRay at the local port. Use a reserved subdomain when you need a consistent HTTP address." },
        { title: "Share and inspect", description: "Send the public URL to a teammate or webhook provider, then review incoming requests in the console." },
      ],
      label: "Terminal",
      code: "npm install -g outray\noutray login\noutray 3000\n\n# Use your reserved HTTP subdomain\noutray 3000 --subdomain orders",
      note: "Your local service and CLI stay running while the tunnel is live. Reserved subdomains and custom domains require the appropriate account access.",
    },
    capabilities: [
      { title: "More than HTTP", description: "Forward HTTP, TCP, and UDP traffic. Use public URLs for web apps and remote ports for TCP or UDP services." },
      { title: "An address you recognize", description: "Reserve an HTTP subdomain or connect a verified custom domain, so integrations can use the same address next time." },
      { title: "Inspect the exchange", description: "Review request methods, paths, status codes, and timing. Enable full capture when you need supported headers and bodies." },
      { title: "Fits your development setup", description: "Use the CLI directly or integrate a development tunnel with the Next.js, Vite, Express, or NestJS plugins." },
    ],
    useCases: [
      { title: "Webhook development", description: "Receive events from external services on the handler you are editing locally." },
      { title: "Review without a deployment", description: "Give a teammate or client a link to a running development server." },
      { title: "Device testing", description: "Open your local web app from another device using its public HTTPS URL." },
    ],
    next: "observability",
    connection: "A tunnel shows what reached your app. Observability shows what happened inside it.",
  },
  observability: {
    name: "Observability",
    number: "02",
    title: "Find the story behind a request.",
    description: "Bring server-side traces, structured logs, and metrics into one workspace. Follow a request into its dependencies and see where time was spent, without piecing together disconnected output.",
    summary: "Traces, logs, and metrics with shared request context.",
    tags: ["OpenTelemetry", "Node.js SDK", "Framework adapters"],
    workflow: {
      title: "Instrument once. Follow the context.",
      description: "Start telemetry before your server imports its framework and dependencies. OutRay's Node.js distribution handles common instrumentation for you.",
      steps: [
        { title: "Create an ingest token", description: "Give a server-side token the Send telemetry permission." },
        { title: "Start the SDK first", description: "Set the service name and environment in your server bootstrap, before importing the app." },
        { title: "Follow a real request", description: "Send traffic, open its trace, and investigate spans, related logs, and service metrics in the console." },
      ],
      label: "bootstrap.ts · server only",
      code: 'import { startOutrayObservability }\n  from "@outray/observability";\n\nconst telemetry = startOutrayObservability({\n  apiKey: process.env.OBSERVABILITY_TOKEN,\n  serviceName: "orders-api",\n  environment: "production",\n  captureConsole: true,\n});\n\nawait import("./server.js");',
      note: "Install @outray/observability first. Keep the token on the server; never bundle it into browser code. Console capture is opt-in, and telemetry does not require a tunnel.",
    },
    capabilities: [
      { title: "Request and dependency spans", description: "Automatically instrument common Node.js HTTP libraries, frameworks, databases, and clients. Add child spans for your own operations." },
      { title: "Logs with their context", description: "Send structured application logs with the active trace and span context. Opt in to console capture while keeping normal local output." },
      { title: "Metrics for the service", description: "Inspect request counts, duration, and active requests from framework adapters. Use the OpenTelemetry meter for custom application metrics." },
      { title: "Capture under your control", description: "Framework adapters can opt in to bounded JSON and form payload capture, with sensitive fields redacted and additional redaction rules you define." },
    ],
    useCases: [
      { title: "A slow endpoint", description: "Separate time spent in the request handler from calls to a database or external service." },
      { title: "An error with missing context", description: "Read a failure and its related application logs within the request that produced them." },
      { title: "An operation worth measuring", description: "Wrap a background job or business operation in a custom span and record application metrics." },
    ],
    next: "secrets",
    connection: "Keep your observability token server-side. Secrets can deliver it to the process at runtime.",
  },
  secrets: {
    name: "Secrets",
    number: "03",
    title: "Keep configuration out of the handoff.",
    description: "Organize encrypted values in vaults and environments, keep a history of changes, and inject the right configuration into a running command. Your team can share a source of truth without passing around dotenv files.",
    summary: "Encrypted, versioned configuration delivered at runtime.",
    tags: ["Environment vaults", "Version history", "CLI injection"],
    workflow: {
      title: "Choose an environment. Run your app.",
      description: "Create a vault in the console, add its values, and select the target in your project. The CLI fetches authorized secrets for the command you run.",
      steps: [
        { title: "Create a vault", description: "Group a project's configuration and separate development, staging, and production environments." },
        { title: "Choose the target", description: "Authenticate and save your organization, vault, and environment with outray secrets use." },
        { title: "Inject at runtime", description: "Run your existing command through the CLI so fetched values enter the child process environment." },
      ],
      label: "Terminal · development environment",
      code: "outray login\n\noutray secrets use \\\n  --org acme \\\n  --vault orders \\\n  --env development\n\noutray secrets run -- npm run dev",
      note: "Runtime injection avoids creating a dotenv export. Production value access requires confirmation; machine tokens can be scoped to a vault and environment.",
    },
    capabilities: [
      { title: "Clear environment boundaries", description: "Keep values in a named vault and environment. Scope machine tokens to the access a process needs." },
      { title: "Encrypted stored values", description: "Secret values use AES-256-GCM encryption with wrapped organization keys. The console masks values until you explicitly reveal them." },
      { title: "A recoverable history", description: "Review previous versions and restore a historical value. Audit records give sensitive actions an actor and a timestamp." },
      { title: "Works with existing commands", description: "Inject values into a command, import existing dotenv configuration, or explicitly export values when a workflow needs a file." },
    ],
    useCases: [
      { title: "A new teammate", description: "Point them at the development vault instead of sending a file full of credentials." },
      { title: "A separate staging setup", description: "Use the same configuration keys with values intended for a different environment." },
      { title: "A configuration change", description: "Review the value's history and restore a known version if the new one is wrong." },
    ],
    next: "uptime",
    connection: "Once the service is configured and running, Uptime can check its public endpoint from the outside.",
  },
  uptime: {
    name: "Uptime",
    number: "04",
    title: "Know when your endpoint stops answering.",
    description: "Check public HTTP endpoints every minute, follow response times and incident history, and give your users a status page. Keep detection, team alerts, and public communication in one workspace.",
    summary: "Endpoint checks, incident history, and public service status.",
    tags: ["One-minute checks", "Team alerts", "Public status pages"],
    workflow: {
      title: "Check the endpoint. Define what healthy means.",
      description: "Set up the check in the console, decide when failures become incidents, and choose how they appear on your status page.",
      steps: [
        { title: "Add a public endpoint", description: "Use a public HTTP or HTTPS DNS hostname. Choose GET or HEAD and an optional expected response status." },
        { title: "Set failure and alert rules", description: "Choose a failure threshold and team recipients. Configure manual, confirmed, or automatic incident publishing." },
        { title: "Publish a status page", description: "Add service components, group them when useful, and share incident updates with your users." },
      ],
      label: "Monitor configuration · example",
      code: "Name                 Orders API\nURL                  https://api.acme.com/health\nMethod               GET\nExpected status      200\nResponse contains    ok\nCheck interval       60 seconds\nFailure threshold    3 checks\nIncident publishing  After confirmation",
      note: "Checks support public HTTP(S) endpoints, not private addresses or TCP/UDP services. A new monitor stays Unknown until its first check completes.",
    },
    capabilities: [
      { title: "A check with a definition", description: "Use GET or HEAD, custom permitted headers, and an expected HTTP status. GET checks can also match response text." },
      { title: "History, not just a green dot", description: "Review observed uptime, response time, recent check results, and incidents to understand a service's behavior over time." },
      { title: "Alerts for your team", description: "Notify selected organization members by email and connect supported notification integrations. Use failure thresholds to define when to act." },
      { title: "Status your users can read", description: "Publish a branded page with components and groups. Control incident publishing and send team-published updates to subscribers." },
    ],
    useCases: [
      { title: "A public health endpoint", description: "Check whether the endpoint is reachable and returns the response you expect." },
      { title: "A customer-facing incident", description: "Keep a visible incident timeline and communicate progress on a public status page." },
      { title: "A service dashboard", description: "Bring endpoint status and response-time history into the same workspace as your other tools." },
    ],
    next: "observability",
    connection: "Uptime tells you a service is failing. Observability helps you investigate what the server did.",
  },
};
