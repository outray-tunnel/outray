# OutRay web

## Agent (AI SDK + Grok)

The console Agent is a server-backed, read-only observability investigator. The
Agent button opens private chat history; **Ask agent** on a captured observability
request starts a separate chat using its ID. The server retrieves and sanitizes
evidence itself. Progress describes actual tool calls, not simulated reasoning.

Replies use a streaming Markdown renderer for headings, emphasis, lists, code,
and tables. Evidence-backed request summaries, trace timing, traffic comparisons,
and correlated-log metadata are streamed separately from the model's narrative
and saved in the existing evidence JSON. Those cards appear on new investigations;
older chats without evidence snapshots still render their formatted text and
source links. No additional migration is needed for the presentation refresh.
Raw HTML, media, embeds, and external model-generated links are disabled.

### Enable locally or on your application host

Use **Node.js 22+** (required by AI SDK 7 and the xAI provider). Add these to the
web application's server environment, never a public/Vite-prefixed variable:

| Variable | Purpose |
| --- | --- |
| `XAI_API_KEY` | Required xAI API credential. Locally, put it in the root `.env` used by `npm run dev`. |
| `AGENT_GROK_MODEL` | Optional model override. Default: `grok-4.7`; use an xAI model that supports function calling. |
| `AGENT_ENABLED` | Set to `false` to disable new investigations. Existing private history remains readable. |

The Agent uses the web app's existing `DATABASE_URL`, `REDIS_URL`, and Tinybird query
configuration. No separate database, VPS service, or Vercel account is needed.
`XAI_API_KEY` stays on the server; the browser receives neither it nor provider
configuration objects.

Migration `drizzle/0028_agent_conversations.sql` creates only `agent_threads`,
`agent_messages`, and `agent_runs`, with ownership indexes and foreign keys.
It has been generated, **not applied**. Apply pending migrations through the
existing migration flow before enabling the Agent. To apply existing migrations
against the development database selected by the root `.env`, run from the
repository root after checking that database destination:

```sh
npx dotenv -e .env -- npm exec --workspace=outray-web -- drizzle-kit migrate
```

For the application host, use the existing `db:migrate:ci` flow and that host's
environment. This command applies all pending migrations; do not point it at
production without the normal review/approval. This implementation does not
apply migrations or deploy anything automatically.

Your reverse proxy/application host must support streaming responses, avoid SSE
buffering, and allow requests lasting at least 90 seconds. The endpoint sets
`X-Accel-Buffering: no` and emits heartbeat comments every 15 seconds. Restart
your own dev process after adding environment variables.

### Evidence, permissions and privacy

- Every API call checks organization membership. Saved chats are private to the
  authenticated creator within that organization, not shared team chats.
- The model gets only server-resolved history and allowlisted request, trace,
  correlated-log metadata, and 1h/24h request comparison tools. Tool arguments
  cannot supply an organization ID or arbitrary SQL/query endpoint.
- Headers, bodies, query values, full URLs, IP addresses, arbitrary attributes,
  and original log messages are withheld from model evidence. Logs supply fixed
  category hints, such as a timeout being mentioned. Route identifiers are
  sanitized, and trace/log tools stay bound to the attached request.
- User prompts are sent to xAI and saved in PostgreSQL. Common accidentally pasted
  credentials are redacted, but this is **not a DLP guarantee**: do not put secret
  values or sensitive personal data in chat. Model replies are also saved.
- Provider response storage is disabled with `store: false`. That is not a claim
  of complete zero retention; xAI's account/data policies still apply. Raw
  provider exceptions and hidden reasoning are not logged or streamed to the UI.
- Evidence is queried without the dashboard cache. Retrieval time is not event
  time, and ingestion lag/retention still apply. Failed queries remain distinct
  from empty results. Evidence links open filtered console lists, not necessarily
  an exact-record inspector.
- The Agent cannot replay requests, read vault values, publish incidents, modify
  settings, execute code, or browse arbitrary websites. AI conclusions still need
  human verification; telemetry correlations do not prove root causes.

### Limits and failure behavior

Database-locked admission allows one active run per user, three per organization,
50 new runs per user/day and 250 per organization/day (UTC). A duplicate message
ID reuses its saved run rather than charging for a second investigation. There
are at most six model steps, eight evidence calls, 1,536 output tokens per step,
and a 90-second deadline. The cumulative 24,000-token cutoff is checked between
steps, so it is a **soft** ceiling, not a hard cost limit. Completed-step usage is
saved; an interrupted provider step may not report its token usage.

Closing the overlay or switching chats keeps a local response running. Stop,
workspace changes, and page unmount abort it. Interrupted work is marked failed
after 120 seconds when history/admission is checked; another browser can refresh
history to see the result. Unsent drafts stay only in the current tab. History
loads the most recent 30 chats and up to 100 messages per chat.

No configured key or missing migration produces an actionable error instead of
falling back to fake answers. Offline tests use SDK mock models, mocked telemetry,
and fake database clients; a real Grok response still needs a configured key and
a separate live smoke test. None of those tests touch an application database or spend model
credits.

### Monthly organization token usage

Saved Agent run usage is also accumulated in the console's existing Redis database.
Every member's runs contribute to their organization, across all private threads.
Months are **UTC calendar months**, assigned by the run's `started_at`, including
runs that finish after midnight or after a month boundary. Failed/cancelled runs
count any usage the provider reported for completed steps, not just successful replies.

The Redis hash `agent:usage:{<encoded-organization-id>}:YYYY-MM` contains
`input_tokens`, `output_tokens`, and `total_tokens` (input + output), plus per-run
watermarks used for idempotency. It contains no prompts, replies, evidence, or user
IDs. Hashes have **no TTL**. Configure Redis persistence and a non-evicting policy
if retaining these totals; no Redis server settings are changed by the application.
Internal readers can use `agentMonthlyUsage.get(organizationId, month)`: missing
hashes return zero, while outages/corrupted counters throw rather than claiming
zero usage.

PostgreSQL commits before accounting. An atomic Redis operation applies only new
usage, so checkpoints, concurrent retries, and replaying saved runs do not count
twice. The first terminal snapshot reconciles the final counts, including downward
corrections, and ignores late callbacks. Redis failures leave the Agent usable and
the database counts intact; accounting commands have a one-second timeout and a
30-second write cooldown after failure. Redis totals can be incomplete until
reconciliation after an outage, eviction, or enabling this feature on existing data.

Backfill or repair **one explicitly selected organization ID and UTC month** from
saved PostgreSQL runs, from the repository root after verifying the `.env` database
and Redis destinations:

```sh
npx dotenv -e .env -- npm run agent:usage:reconcile --workspace=outray-web -- --organization <organization-id> --month 2026-10
```

This reads PostgreSQL in bounded pages and writes only that org/month's Redis hash.
It does not reset totals or delete data; retries after partial failures are safe.
Use the application's server environment instead of `.env` on a host. Backfills
are not run automatically, and none have been run as part of this implementation.
Retain the PostgreSQL runs for recovery; deleting their threads/users cascades to
run history, so future invoicing needs a separate retained billing ledger before
history deletion can be supported. These are reported token totals, **not a charge**
or a guarantee of exact provider invoicing: interrupted steps can lack usage, and
cache/reasoning breakdowns, model pricing, and monetary costs are not yet tracked.

Monthly accounting tests execute the real Lua scripts on a private, temporary
Unix-socket Redis when `redis-server` is installed. They never connect to the
console's development or production Redis; the integration test is marked skipped
when the binary is unavailable.

From `apps/web`, run the focused Agent suite with:

```sh
npx tsx --tsconfig tsconfig.app.json --import ./test/register-css-loader.mjs --test test/agent-*.test.ts
```

## Original Vite template notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
