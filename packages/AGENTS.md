# Shared SDK architecture

- Keep shared HTTP payload capture, redaction, safety decisions, and capture configuration contracts in `@outray/core`.
- Keep shared tracing, export, metrics, and logging behavior in `@outray/observability`; not every shared concern belongs in core.
- Framework adapters translate request context and integrate framework lifecycle hooks. Do not duplicate reusable policy logic in adapters.
- Wire shared SDK behavior through every affected adapter and verify success, errors, privacy, and concurrent-request isolation.
- Application-specific sensitive routes remain application policy. Disabling payload content must not disable request metadata or metrics.
- When publishing a new shared API, release the shared package before its consumers and require compatible dependency versions in those consumers.
