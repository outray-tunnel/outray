# OutRay plugin

This package connects Codex and ChatGPT to OutRay's hosted public MCP catalog at `https://outray.co/api/mcp/openai`. The backend and direct MCP catalog are implemented by the same OutRay web application.

The four bundled skills cover local tunnels, SDK setup and investigation, Secrets administration and opaque local injection, and organization/uptime administration. Local execution is optional; the plugin is not marked desktop-only.

Build and validate the archive with `npm run plugin:package` from the repository root. This creates a development archive under `dist/plugins/`. `npm run plugin:check` checks package structure. `npm run plugin:check -- --release` additionally checks the release prerequisites and intentionally fails while publisher identity or demo evidence is missing.

The repository's `.agents/plugins/marketplace.json` tests the portable package and raw MCP transport. It does not establish the registered account dependency needed to test Codex's native installation sign-in and Manage → Connect UI. For that flow, first register the OAuth MCP app, then run `npm run plugin:prepare:native -- --app-manifest /path/to/verified-outray.app.json`. This generates a local test marketplace with OutRay as a required account connection and authentication on installation. Install it through Codex's Plugins UI to test onboarding. Use a reachable HTTPS endpoint, or a configured Secure MCP Tunnel, for registration; ChatGPT cannot connect directly to a developer's localhost.

The generated test copy uses the same skills and backend. Its account binding stays outside the public-upload source and archive. Public submission converts the verified HTTPS MCP configuration into the directory's managed connection; retain that generated binding when updating the finalized release.

See `docs/outray-mcp-release.md` in the repository for deployment, reviewer fixtures and submission steps. A valid development ZIP does not mean the endpoint has been deployed or the plugin has been submitted, reviewed or published.
