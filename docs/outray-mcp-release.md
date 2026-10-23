# OutRay MCP and plugin release

Version: **0.1.0**. Source: `plugins/outray`. Public upload: `dist/plugins/outray-0.1.0.zip`.

## Implementation

The web application hosts `/api/mcp` (direct catalog) and `/api/mcp/openai` (explicit public allowlist). Both use MCP TypeScript SDK 2.3.1 with its legacy-client compatibility enabled. There is no second server implementation, custom UI, platform-superadmin catalog, or self-hosted directory edition.

Better Auth 1.7.12 provides OAuth discovery, dynamic registration, pinned CIMD metadata transport, authorization-code/PKCE, JWT signing, refresh rotation and RFC 7009 revocation. The two endpoints have distinct resource audiences. Consent saves a bounded selection of organizations; every tool call checks the active connection generation, scopes, current membership and role. Revoking a connection also revokes its refresh families and invalidates its JWT generation. Successful OAuth client refresh-token revocation invalidates that connection too. Account-wide connection management is in Personal settings → Connected apps at `/account/settings/connected-apps`, accessible from the dashboard account menu even without organization membership. The stable `/plugins/connections` link and legacy organization Connected apps routes redirect there. Organization settings have their own navigation for General, Members, API tokens and permitted Billing access. Passwordless email uses the existing Zepto provider and existing signup restrictions; social login remains available.

Tools reuse existing product handlers in process with an authenticated actor bound to the exact Request object. No browser session or API credential is minted for dispatch. Existing product validation, tenant predicates, transaction locks, quotas, production safeguards and product audits remain in effect. Organization membership changes use the same quota lock and preserve role hierarchy and last-owner rules.

The public catalog excludes secret values, arbitrary replay payloads, private monitor headers, secret import/export, share-link creation and credential generation. Public projection removes sensitive payloads, headers, attributes, events, string values, credential patterns, URL credentials/query strings/fragments and commercial plan fields. Public logs use fixed category hints. Errors do not repeat provider diagnostics or subscription offers. Direct value tools require `outray:secrets:values` in addition to the appropriate read/write scope. Billing returns usage or a neutral console link; payment changes happen in OutRay.

MCP activity stores user/connection/tool identifiers, selected organization/resource identifiers, timestamp and outcome. It never stores tool arguments, results, conversations or values. Cron deletes activity older than 90 days in bounded batches and removes old revoked connections. Existing product audit retention remains governed by the product's policies. Sensitive OAuth/MCP routes retain request metadata and metrics while excluding captured payloads and signed query values.

## Run locally

Use the existing environment and development startup. `APP_URL` must be the canonical HTTPS origin in production; loopback HTTP is supported locally. The application uses its existing PostgreSQL, Redis, Zepto, Tinybird and Secrets keyring configuration. `OUTRAY_MCP_ENABLED=false` disables MCP dispatch for an emergency rollback. No new shared API key is needed.

Apply migrations **0042 and 0043** after the preceding migrations and before starting the new web/cron build. They add OAuth/connection/activity tables and extend the Secrets audit credential constraint to `mcp`. Never run `db:generate-auth` over the existing auth schema to generate these additive tables. `scripts/generate-mcp-auth-schema.mjs` generates the additive provider schema separately.

```sh
npm run plugin:check
npm run plugin:package
npm run mcp:test:integration
npm run build --workspace=outray-web
node scripts/test-outray-mcp.mjs --production
npm run test --workspace=outray-web
npm run test --workspace=outray-cron
npm run test --workspace=outray
```

The integration runner creates and destroys a disposable local PostgreSQL database and Redis process. It refuses a remote administrator DSN. Historical migrations cannot bootstrap a completely blank database, so the runner generates the existing schema baseline, then applies the actual MCP migrations. `--production` also starts and stops the built application, runs real OAuth and MCP client traffic, checks public pages, and verifies CLI secret injection into a child process without returning values or credentials. No production database is migrated by these tests.

### Native installation and Connect

The acceptance flow is: install OutRay → Codex opens OutRay OAuth sign-in → choose organizations → approve → return to Codex. If sign-in is cancelled or access is revoked, the installed plugin's Manage page must show an OutRay account row with **Connect**. Connecting must resume that same OAuth flow. An existing OutRay browser session may skip credential entry and go straight to consent.

That row belongs to the host's registered app lifecycle. The local portable `mcp.json` configuration and `authentication: ON_INSTALL` policy alone do not establish the account mapping. A CLI `codex mcp login` test validates the transport separately and does not prove this native onboarding works.

1. Deploy the public endpoint and discovery routes and run `npm run mcp:check:live`. Alternatively, configure a supported Secure MCP Tunnel for private testing. Do not register a dead production URL or disable OAuth to bypass connectivity. A raw localhost URL is not reachable by ChatGPT's servers.
2. In [ChatGPT Plugins](https://chatgpt.com/plugins), select **Add → Add custom MCP server**. Name it **OutRay**, connect `/api/mcp/openai`, and choose **OAuth**. In advanced settings preserve its exact resource URL, CIMD with DCR fallback, and default scopes `openid profile email offline_access outray:read outray:write`. Do not request secret-value scopes. The creator reviews the risk notice and completes OAuth consent.
3. Use the resulting real `plugin_asdk_app…` plugin reference with Plugin Creator to obtain its registered app binding. Copy the actual app ID from discovery unchanged; a plugin ID is not an app ID. Save the verified `.app.json` outside `plugins/outray`. Do not reuse another provider's ID.
4. Generate the native local test marketplace:

   ```sh
   npm run plugin:prepare:native -- --app-manifest /path/to/verified-outray.app.json
   codex plugin marketplace add ./dist/plugins/outray-native-marketplace
   ```

   Install OutRay from **OutRay native connection testing** in Codex's Plugins UI. The generated copy binds the required OutRay app, requests authentication on installation, and omits duplicate raw MCP wiring. It preserves the four skills and branding. Use a new output directory with `--output` when regenerating, or explicitly remove the old generated directory first. The public `0.1.0` source and upload package remain portable and exclude private bindings.
5. Test a fresh install while disconnected, cancellation followed by **Manage → Connect**, successful organization consent, a harmless `list_organizations` call in a new chat, reconnect after revocation, and installation with an already connected account. Confirm one OutRay connection row and no second raw-MCP login. Record browser launch and connection state; source checks alone cannot establish this host behavior.

On 2026-10-23, a private OutRay app was registered through ChatGPT's custom MCP flow: `plugin_asdk_app_6adb1adf34b881919b018a8e66252014`, with verified app ID `asdk_app_6adb1adf34b881919b018a8e66252014`. The binding was read back through Plugin Creator and used to install `outray@outray-native-development`, version `0.1.0-native.1792744332337`. The installed package has one required app, authentication on installation, all four skills and no duplicate raw MCP configuration. The earlier `outray-local-development` installation and separate `outray-local` MCP entry were removed.

The initial share link opened the registered app's minimal generated plugin rather than the fully branded local package. Its app icon had been omitted during registration; it also had no packaged skills or starter prompts. The registered entry was updated in place to version `1.0.1`, release `pluginrel_6adb1ed170c88191b15e3dd120936af7`, adding the four existing skills while preserving the exact app binding and App-owned interface. Its description was restored through the owning app's editor. Read-back and browser inspection confirmed all four skills and the disconnected Connect control. The custom-app editor exposes name and description, but no icon, starter-prompt, category or listing-link controls.

The user explicitly chose to save the complete package as a private OutRay plugin. Its link is `https://chatgpt.com/plugins/plugins_6adb215850008191b6b2ffcccaa0da2a`, USER scope and PRIVATE visibility. Current version: `0.1.4`; current release: `pluginrel_6adb277fdb288191ac03311f05ffb863`. It reuses the same required registered app and temporary runtime. After the duplicate entries confused testing, this account package was **uninstalled**, preserving its saved source and release rather than deleting it. Browser inspection of installed plugins confirmed it is absent and the required registered connection remains. Do not reinstall it as a refresh of the local package. The registered app remains the OAuth dependency; it was not deleted or re-registered.

The private import initially refused the public review cases because this package uses a registered app rather than a portable `mcpServers` entry. Only `review.test_cases` was omitted from the private copy; all five positive and three negative cases remain in the public source. Browser verification confirmed the three starter prompts, full description, Developer Tools category, website/policy links, four skills and Connect control in the detail page's Apps section. The standalone package's Manage page shows a Uses → OutRay dependency link rather than an inline Connect button; that link opens the registered app's management page. Do not describe this as an end-to-end verification of the requested Codex install/Manage behavior. Both original PNGs are present and referenced in read-back manifests. However, the ChatGPT web listing still displays its default document icon. A supported compatibility-overlay update with the same images did not resolve that rendering. HTTPS icon references were rejected by validation without changing the release. Further private diagnostics tested normalized relative paths (0.1.2) and four fresh SVG asset paths using the existing OutRay vector (0.1.3). Both saved successfully, but the fully loaded web page still selected the document fallback rather than an uploaded image URL. Version 0.1.4 restores the original PNG references in synchronized portable and compatibility manifests and removes the diagnostic SVG files. Do not repeat these unsuccessful diagnostics or claim the web icon is fixed. The public source and release package remain unchanged; this private package is not a public submission or production release.

For the user's immediate Codex testing, the original local package was restored through the supported CLI marketplace flow at `dist/plugins/outray-native-restored`. Installed and enabled selector: `outray@outray-native-development`, current version `0.1.0-native.1792747340961+codex.20261023093818`, marketplace label **OutRay native connection testing**. It preserves the same required registered app with `ON_INSTALL` authentication and no duplicate raw MCP server. Installed-file checks confirmed all four icon references resolve to the exact original PNG bytes, three prompts, four skills, and synchronized manifests. The user supplied a screenshot confirming the local logo renders. All four skills now distinguish plugin **Connect** and browser consent from separate local CLI login. The same local installation was updated in place using the bundled cachebuster helper and CLI reinstall; no new marketplace or account plugin was created. Use a new chat to pick up updated skills. Native Codex UI automation is unavailable in this session, so the current desktop authentication flow remains unverified.

The registered app's generated entry is now connection-only: version `1.0.2`, release `pluginrel_6adb2b1be1bc819197ab29ff7373e76c`. Its four duplicate skill files and the skills declaration were removed through a guarded update, leaving the exact original `.app.json` binding intact. Its concise description is now `Manage OutRay tunnels, observability, uptime, secret metadata, and organizations.` The branded local package provides the four workflows; the retained generated app provides authentication and MCP access. Do not promise a single visible entry while the local testing package depends on that separately installed development app. No production registration, revocation, new consent grant, public submission or deployment was performed during this cleanup.

Package regression checks now reject missing primary/composer branding, invalid or external asset paths, truncated PNGs, private app declarations in shadowed compatibility manifests, mismatched compatibility identity/presentation/MCP wiring, and missing/additional public OAuth scopes. Eleven package/native-generation tests and all four skill validators passed. The older bundled local-plugin validator rejects modern supported fields (`required`, `brandColorDark`, `composerIconDark`, `supportURL`) and the public draft's deferred publisher metadata; do not remove required connection behavior or branding to appease that stale validator. The repository validation and supported CLI installation succeed. The refreshed public ZIP still contains one production endpoint, four skills and the original images; it remains a draft awaiting publisher identity and real demo evidence.

This private test previously used the temporary OutRay tunnel `https://dirty-brain.outray.app` to a separate built web runtime on port 6768, with that origin as `APP_URL`. The tunnel explicitly used the existing `titanium` organization and disabled CLI request logs; it did not switch the CLI's active organization. The latest check on 2026-10-23 received **502 / offline** from that test origin. The user will deploy production themselves; no replacement tunnel or app was created. After deployment run `npm run mcp:check:live`, then verify the registered connection's endpoint/resource and complete fresh OAuth consent for production. Do not describe the existing temporary registration as a working production connection. The production plugin still points at `https://outray.co/api/mcp/openai` and has no private app binding.

The native browser connection reached real OutRay email sign-in with public scopes and PKCE. It exposed a continuation bug: Better Auth 1.7.12 requires `postLogin: true` on `oauth2Continue`. The handler now supplies that flag and forwards provider cookies. A PostgreSQL/Redis regression reproduced HTTP 400 before the fix and then passed, including signed-out denial, single/repeated resource continuation, organization consent preview and tampered-scope refusal. After rebuilding and restarting the temporary runtime, the user's real email session reached the **Connect ChatGPT** organization selector. No organization was selected or access approved by the agent. ChatGPT's registered-app Manage page visibly showed **OutRay → Connect** while disconnected. Final consent, an authenticated host tool call and the Codex desktop Manage row still need live verification; installation metadata alone does not establish them.

Production still needs deployment. On 2026-10-23, unauthenticated MCP initialization and JSON resource discovery at `outray.co` returned HTTP **406**, `Only HTML requests are supported here`, instead of an OAuth challenge and resource metadata. The temporary test origin returned the expected HTTP 401 challenge and HTTP 200 discovery. OpenAI's [local MCP plugin workflow](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server) describes registration; [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) is another private test transport. Public submission uses the portable HTTPS configuration; keep the portal-generated app binding in the finalized managed release.

### Raw MCP transport testing

For a Codex server already configured as `outray-local` with URL `http://localhost:6767/api/mcp/openai`, start public consent with explicit scopes:

```sh
codex mcp login outray-local --oauth-client-registration dcr --scopes openid,profile,email,offline_access,outray:read,outray:write
```

The automatic login started by `codex mcp add` can request the authorization server's direct-only `outray:secrets:values` scope. Public consent refuses that request; cancel it and use the scoped login above. Codex can also repeat the same resource URL when both discovery and an explicit resource override supply it. Consent and token claims accept identical repeated identifiers while rejecting multiple distinct endpoints.

On 2026-10-23, the repeated-resource regression reproduced the consent failure before the fix. All 12 database integration checks then passed, including repeated-resource consent, code exchange and refresh, cross-catalog denial, and refusal of direct-only permissions at public consent. The local Codex browser flow reached organization selection with public scopes; user approval remains required to finish that connection.

### Verification recorded on 2026-10-22

- Production build passed. Real SDK HTTP-client tests passed for both catalogs, including legacy negotiation and direct invocation of excluded public tool names.
- Disposable PostgreSQL/Redis tests passed for discovery, valid and invalid PKCE, signed-query tampering, consent CSRF, resource audiences, organization selection and isolation, role changes, invitations, last-owner protection, alerts, quotas, vault/secret operations, refresh rotation, OAuth/client and browser revocation, metadata-only activity and 90-day expiry. A controlled upstream HTTP 503 verified public error projection.
- Built-server checks passed for landing/policy/login pages, real consent and OAuth exchange, shared product reads/writes, and opaque CLI injection. Browser inspection confirmed the landing and email-sign-in pages render. The disposable build has no PostHog token, so its existing analytics initialization reports missing configuration; this is separate from MCP.
- CLI: 57 passed. Express SDK: 8 passed. TanStack SDK: 19 passed. Observability SDK: 35 passed. Cron: 61 passed, 1 skipped. Public package guard checks: 5 passed.
- Full web suite: 2,279 passed, 38 failed, 11 skipped. A temporary archive of unchanged Git HEAD, using the same installed dependencies, had 39 failures. All 38 remaining failure titles occur in that baseline; the route-reservation failure is resolved. The full web typecheck still reports existing unused declarations and observability parameter-type errors; it reports none in the MCP implementation.
- Real production email delivery, live telemetry investigation, public tunnel creation/cleanup, and host-level plugin cases in Codex/ChatGPT remain unverified until deployment and reviewer setup. The SDK regression suites and local synthetic injection test do not substitute for those release checks.

## Reviewer organization and evidence

Choose a dedicated mailbox reviewers can actually access. Configure `MCP_REVIEW_EMAIL` privately and run the following with the target deployment's protected runtime environment:

```sh
node scripts/prepare-outray-mcp-review.mjs
node scripts/prepare-outray-mcp-review.mjs --allow-remote --apply
```

The first command is a dry run. The apply command creates an isolated `mcp-review` organization, reviewer owner, `demo/development` vault with a synthetic entry, paused example.com monitor, status page and unpublished incident. It refuses unrelated existing organizations or accounts with other memberships. It does not send an email, create a password, publish a status page, or start probes. Verify actual magic-link email delivery in that mailbox before entering access instructions in secure portal fields.

Optionally set `MCP_REVIEW_INGEST_ORIGIN` to the real HTTPS ingestion origin. The command creates a temporary observability-only credential, sends one synthetic failed `demo-service` request trace through OTLP, and revokes the credential in a finally block. Confirm ingestion through `list_services`/`list_traces`; an accepted ingest response is not proof of searchable data. Refresh sample evidence before recording/review, because the investigation uses a recent time range.

Five positive and three negative cases are stored in `plugin.json`. They cover organization/tunnel discovery; telemetry investigation; paused monitor creation; an unpublished incident update; secret metadata; secret-disclosure refusal; purchase refusal; and unsupported infrastructure refusal. Run them in Codex and ChatGPT against the exact saved release. Source/integration tests do not establish that these host-level review cases passed.

All eight host-level review cases currently have status **Not run**. The production MCP endpoint is not deployed, the reviewer mailbox has not been supplied, and no real walkthrough has been recorded. Preserve those statuses until the actual saved release is exercised and evidence is recorded.

Record a real walkthrough showing sign-in, organization selection and the five positive cases. Show bounded evidence and truthful empty/error states, an unpublished incident, and secret names without values. Finish by revoking the connection and demonstrating denial. Keep login links, credentials and browser storage out of the recording. Host it at a reviewer-accessible URL, verify playback, and set `extensions.com.openai.review.demo_recording_url`. A script is not a recording. Reviewer mailbox credentials and access instructions belong only in secure portal fields.

## Public access and deployment

`outray.co` currently resolves through Cloudflare to Brimble, rather than either legacy Vercel project. Use the existing Brimble deployment for the web app and the existing Woodpecker migration/worker flow. Brimble's web build must not run migrations independently. Do not promote unrelated uncommitted work with this release.

The workspace already contained uncommitted product-usage migrations 0039–0041 and other product changes when MCP work began. These have been preserved. Coordinate their release ordering before deploying MCP migrations 0042–0043; do not silently publish those other changes or skip migration history. No commit, push or production migration has been performed for this work.

Cloudflare originally returned error **1010** to automated clients. On 2026-10-22 a scoped configuration rule disabled Browser Integrity Check only for the four listing pages, MCP, OAuth and discovery paths on `outray.co`. Other security settings remain unchanged. Source: `deploy/ops/outray-mcp-cloudflare.json`; ruleset `97bc85639dcb420899f63c51310e2e55`, rule `6107ed0fb91a47959b903390fce023c0`, version 1. To roll back, remove that rule (or its otherwise empty ruleset). Cloudflare documents this per-path setting at https://developers.cloudflare.com/rules/configuration-rules/settings/.

After the change `/contact`, `/privacy` and `/terms` returned HTTP 200. `/plugins/codex`, `/api/mcp/openai` and discovery returned **404**, because this implementation had not been deployed. The revised privacy/terms text in this repository is not yet the published policy. Deploy the migrations, web app, and retention worker, then run:

```sh
node scripts/check-outray-mcp-live.mjs
```

This checks listing pages, unauthenticated OAuth challenges and exact resource/issuer metadata. It never uses real access tokens. Also verify a real consent/refresh/revocation flow with each client, live Tinybird investigation, local tunnel creation/cleanup and SDK setup. Do not treat an HTTP 200 landing page as proof that authenticated MCP works.

## Submission and publication

Current state: local package drafted and implementation tested; **not uploaded, submitted, approved or published**.

Before final packaging, supply the verified individual or business publisher's exact display name as `interface.developerName`, verify the real demo URL, provision and test reviewer mailbox access, and pass the live checks. The listing uses existing OutRay light/dark assets, category `Developer Tools`, version `0.1.0`, English base text and unrestricted country targeting (`publication.countries: []`). Review commerce metadata describes neutral billing links and no purchases in the plugin.

```sh
node scripts/outray-plugin.mjs --release
npm run plugin:package
node scripts/check-outray-mcp-live.mjs --release
```

Inspect the archive contents after rebuilding. It must contain portable manifests, four skills and referenced PNGs, and must not contain `.app.json`, private app bindings, environment files, reviewer credentials or development catalogs. Local marketplace registration is outside the public archive.

Once all prerequisites pass, upload the reviewed ZIP as a portal draft under the intended publisher, complete domain/developer verification, connect only the public endpoint, run scans and the saved release's review cases, and verify the imported metadata. The authorized developer must complete the legal/policy attestations personally. Submit only after those requirements pass. Directory approval is an external dependency; publish only the intended approved release and report draft upload, submission, approval and publication as distinct states.
