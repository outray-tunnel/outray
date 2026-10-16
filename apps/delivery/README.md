# OutRay Delivery

Hosted status-page logos live under the `uptime-logos/` prefix in the existing
`outray` R2 bucket. This Worker serves only that logo prefix; it does not expose bucket listing or an
unauthenticated write API. Self-hosted installations use the console's persistent
disk implementation instead and do not need this Worker or Cloudflare.

Public URLs use immutable, random UUID v4 filenames:

```text
https://delivery.outray.co/uptime-logos/{uuid}.png
https://delivery.outray.co/uptime-logos/{uuid}.webp
```

The canonical public path matches the R2 object prefix, `uptime-logos/`.
Previously issued `/status-page-logos/{uuid}.png` or `.webp` URLs remain readable
as compatibility aliases to the same objects. New hosted uploads always return
`/uptime-logos/` URLs; self-hosted disk URLs remain `/status-page-logos/`.

## Provisioning

1. Bind the existing R2 bucket `outray` without changing its access settings. Keep logos
   under `uptime-logos/`; do not create a separate logo bucket or expose other
   bucket prefixes.
2. Add a cryptographically random upload credential of at least 32 characters as
   the Worker secret `DELIVERY_UPLOAD_TOKEN`. Supply it through the interactive
   Wrangler secret prompt, or a secret manager's JSON stream:
   `wrangler secret bulk --config apps/delivery/wrangler.jsonc`.
3. Give the server-side console the same `DELIVERY_UPLOAD_TOKEN`; never use a
   `VITE_`/public environment variable or browser request for this credential.
4. Run `npm run build --workspace=outray-delivery`, then
   `npm run deploy --workspace=outray-delivery -- /absolute/path/to/env-file`.
   The deployment helper selects only `DELIVERY_UPLOAD_TOKEN` from that file,
   sends it to Wrangler through JSON stdin, and never creates a credential file
   or prints its value. It then deploys and checks the Worker and custom-domain
   `/health` endpoints with bounded retries. A pending custom domain is reported
   explicitly; do not enable console uploads until that hostname is healthy.

The configuration attaches the Worker to `delivery.outray.co`; no VPS origin is
used. The only public diagnostic endpoint is `GET /health`, which returns
`{"ok":true}` without accessing storage or exposing settings.

## Internal API

Authenticated console requests use `Authorization: Bearer <DELIVERY_UPLOAD_TOKEN>`:

- `PUT /internal/status-page-logos/{uuid}.png` (or `.webp`): raw image bytes,
  `Content-Type: image/png` or `image/webp`, and an accurate `Content-Length`.
  Maximum size is 256 KiB. Extension, content type, and file signature must agree.
  Returns `201` JSON `{ "key": "uptime-logos/...", "url": "https://delivery.outray.co/uptime-logos/..." }`.
  An existing key is not overwritten (`409`); replacements receive a new UUID.
- `DELETE /internal/status-page-logos/{uuid}.png` (or `.webp`): idempotent `204`.

Public `GET` and `HEAD` support ETag revalidation and use
`Cache-Control: public, max-age=31536000, immutable`. Logos are intentionally
public; deleting the R2 object does not revoke copies already cached by browsers.
Do not put secrets, credentials, or sensitive data in a logo.

The source exports `handleRequest`, `logoKey`, `matchesImageFormat`,
`authorizedUpload`, and `readLogoBody` for targeted verification without deploying.

## Existing database logos

Existing base64 logos remain supported. After the delivery hostname and updated
console are live, an operator can explicitly migrate them using the selected
database/storage configuration:

```sh
npm run status:logos:migrate --workspace=outray-web -- --env-file /absolute/path/to/.env.prod
npm run status:logos:migrate --workspace=outray-web -- --env-file /absolute/path/to/.env.prod --apply
```

The default is read-only dry-run. Apply uploads each valid legacy logo, verifies
the public URL's exact bytes, then replaces its database value only if it has not
changed concurrently. It neither fetches arbitrary existing URLs nor rewrites
external logos. Self-hosted mode uses its configured disk directory and console
URL instead. No unrelated env-file credentials or image contents are printed.
Replaced/removed immutable logos are conservatively retained because cached
pages or another page with the same URL may still reference them.
