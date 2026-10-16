# Hosted Status snapshots

`src/lib/snapshots.ts` is a private-R2 last-known-good layer for the hosted
Cloudflare runtime. The Node/VPS and self-hosted paths remain pass-through when
no bucket is supplied.

**Not activated in production.** The R2 bucket exists but its Worker binding is
deliberately absent. Before enabling fallback, implement a strongly consistent
publication/visibility generation fence: revoke the generation before destructive
database mutations, mark snapshots with their page and generation, and reject
stale writes/reads for revoked generations. Plain R2 deletion, even before a
mutation, has an in-flight-render race and is not sufficient privacy revocation.

The helper stores only successful public HTML responses for exact HTTPS hosts
and exact public status paths. Requests with queries, cookies, credentials, or
private responses are never stored. Health, API, confirmation, subscription,
unsubscribe, and token routes are outside the eligible path set. HTML is capped
at 2 MiB. The default eligibility lease is five minutes and the hard maximum is
one hour; a successful render refreshes the exact URL's lease. A stale response
is marked by `X-Outray-Status-Snapshot: stale`, includes its capture timestamp,
shows an in-page stale notice, and is returned with `Cache-Control: no-store`.
Health responses never use this fallback.

Middleware must let `snapshotResponse` see the final CSP/security headers on a
successful render, and must apply the common security headers to its returned
stale response as well. R2 is not a public asset origin.

After the generation fence exists, administrative changes should also call
`invalidateStatusSnapshot`. Invalidation is intentionally exact rather than prefix- or
bucket-wide. Unpublishing a page, changing a slug/domain, or deleting a page
must enumerate the page root and all published incident paths for the canonical
host and every custom host. Incident deletion must enumerate that incident's
canonical and custom-host paths. A missed invalidation remains bounded by the
persisted eligibility lease, but that bound is a backstop rather than the normal
revocation mechanism. An eligible public request that returns a redirect, 404,
or 410 also removes its exact snapshot.
