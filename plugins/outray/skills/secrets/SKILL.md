---
name: secrets
description: Use when a user wants to manage OutRay vault or environment metadata, inspect key names and versions, administer secret access, or inject secrets into a local application without displaying their values.
---

# OutRay Secrets

Use `list_organizations`, `list_vaults`, `get_vault` and `list_secrets` to discover authorized targets and stable identifiers. The public plugin handles metadata and permitted administration; it has no secret-value or credential-generation tools.

If the plugin is disconnected, use its **Connect** control for browser sign-in and organization consent. CLI login is separate and is needed only for the local injection workflow below; never request a token to connect the plugin.

Never request, reveal, print, export or copy secret values or authentication credentials into the conversation. If the user asks to reveal or edit a value, explain that this connection does not support that operation and direct them to the appropriate OutRay console workflow. Do not call another MCP endpoint or inspect local credential storage to bypass the public catalog.

When the user's task requires local secret injection and local execution is available:

1. Inspect the intended application command and choose a vault and environment from actual project configuration or returned metadata.
2. Use normal `outray login` authentication if needed. Never display its saved tokens.
3. Run `outray secrets run --org <org> --vault <vault> --env <environment> -- <application command>` through a managed process session. Consult the installed CLI help for exact options. Values remain in the child environment.
4. Do not run `env`, `printenv`, secret-dumping scripts, `secrets pull`, or `secrets list --values`. Do not log child environments or exported files.
5. Verify the application through its normal health or functional behavior and retain its process ID for cleanup.

For production environments, obtain the user's explicit production intent and preserve the CLI's `--confirm-production` guard. Do not add the flag merely to silence an error. For rollback, deletion, restoration and permanent purge, use current metadata/revisions and the exact confirmation requested by OutRay. Do not invent confirmation phrases or skip a revision conflict.

Without local execution, provide the injection command for the user to run. Keep values outside the conversation in both paths.
