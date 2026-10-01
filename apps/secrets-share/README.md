# OutRay Secrets Share

`outray-secrets-share` is a standalone Astro 5/Node service. It has no dependency on the OutRay edge VPS, Caddy, Woodpecker, or the dashboard runtime. Anonymous visitors can create an encrypted share; organization shares are created by the dashboard and use the same share tables.

## Database preparation

Apply `apps/web/drizzle/0024_secrets_share.sql` through the existing Brimble migration flow **before** starting this service or deploying the dashboard changes. The migration is additive apart from extending the existing Trash batch root-type check. Do not run the migration with the share service's restricted user.

Create a separate PostgreSQL role for this service. Replace the sample password and `outray` database name with your actual generated credentials and database name, and use your database's existing TLS settings:

```sql
CREATE ROLE outray_share_app LOGIN PASSWORD 'REPLACE_WITH_RANDOM_PASSWORD';
GRANT CONNECT ON DATABASE outray TO outray_share_app;
GRANT USAGE ON SCHEMA public TO outray_share_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.secret_share_links,
  public.secret_share_rate_limits TO outray_share_app;
GRANT SELECT ON TABLE public.secret_share_ownership TO outray_share_app;
```

The share runtime must **not** receive the dashboard's database URL, Secrets master keys, or permissions on vault tables. The dashboard retains its current database access, so it can record organization ownership and revoke shares. Review any future table grants separately—avoid granting access to all tables in the schema.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SHARE_DATABASE_URL` | PostgreSQL URL for the restricted role; required. |
| `SHARE_PUBLIC_ORIGIN` | External HTTPS origin, for example `https://secrets.outray.dev`; required in production. |
| `SHARE_RATE_LIMIT_SECRET` | Unique random server-side HMAC key for pseudonymous IP rate-limit keys; required in production. |
| `HOST` | Bind address; default `0.0.0.0`. |
| `PORT` | Listen port; default `4324`. |
| `SHARE_CLIENT_IP_HEADER` | Optional proxy-supplied IP header. Set only if the host strips incoming copies and sets its own trusted value. Otherwise the connection IP is used. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Defaults to certificate verification. Set to `false` only if your database platform explicitly requires it. |

The dashboard additionally needs `VITE_SHARE_PUBLIC_ORIGIN=https://secrets.outray.dev` at build time so its one-time links point to this service. This value is public and is not a secret.

## Build and run

From the repository root (the isolated lockfile/install keeps the dashboard's private icon packages out of this service):

```sh
cd apps/secrets-share
npm ci --workspaces=false
npm run build --workspaces=false
SHARE_DATABASE_URL=... SHARE_PUBLIC_ORIGIN=https://secrets.outray.dev SHARE_RATE_LIMIT_SECRET=... \
  HOST=0.0.0.0 PORT=4324 npm run start --workspaces=false
```

The health check is `GET /health` (204 when the restricted database connection works). Set `NODE_ENV=production` in production. Place a trusted HTTPS proxy/platform in front of the Node process and map `secrets.outray.dev` there; the hosting platform owns DNS validation and TLS. There is no edge route to configure.

### Brimble example

Create a service from this repository. Keep the full repository available to the build (the share app has a local dependency in `packages/share-crypto`), but use `cd apps/secrets-share && npm ci --workspaces=false` as install, `cd apps/secrets-share && npm run build --workspaces=false` as build, and `cd apps/secrets-share && npm run start --workspaces=false` as start. Set the runtime variables above in Brimble's private environment settings, configure `/health` as its health check, then attach `secrets.outray.dev` as a custom domain in Brimble. Follow Brimble's DNS and certificate instructions for that domain. Do not copy an unrestricted production `DATABASE_URL` or Hugeicons license into this service.

The service serves no analytics or third-party assets. The 32-byte browser encryption key stays in the URL fragment; the server stores only ciphertext, IV, a SHA-256 proof verifier, expiry, and view count. The complete link appears only once. A reveal atomically consumes one view, while merely opening the landing page does not.

This app does not use Astro's server-island or image-optimization endpoints; its middleware returns 404 for `/_server-islands/*` and `/_image`. The API also caps request bodies while streaming. Keep an upstream request-body limit in the hosting platform as defense in depth. Astro 5 currently has upstream dependency advisories, so review `npm audit --workspaces=false` before a public release and upgrade the framework when the repository's Node baseline permits it.

## Operations

Rate limits are 10 anonymous creates and 60 reveal attempts per hour per pseudonymous IP. Expiry and view-count limits are enforced on each reveal. An hourly cleanup removes expired/revoked ciphertext and expired rate-limit rows while retaining organization share metadata for audit. Anonymous expired rows are removed after 30 days. To ensure cleanup even on a completely idle instance, arrange an external health request or scheduler; no additional secret is needed.

Run unit tests with `npm run test --workspaces=false`. The concurrent-reveal PostgreSQL test is opt-in: set `TEST_SHARE_DATABASE_URL` to a disposable database with migration `0024_secrets_share` applied, then run the same command. Never point this test at production; it creates and deletes a share row.
