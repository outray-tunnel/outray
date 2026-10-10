# Explicit free prebuilt fallback for a private trial

This separate path moves build work off a small runtime host. It does not change the normal Docker/Compose build or relax deployment preflight. Use freshly completed Node 22 free-mode builds from exactly the same build-relevant source and lockfile, with the intended self-hosted public origins and no runtime/provider credentials during the build. Existing older `.output` directories are not acceptable substitutes.

Stage the eight application outputs and three fixed dependency outputs from that completed checkout. The staging directory must not already exist:

```bash
node scripts/self-hosted-artifacts.mjs stage --source /absolute/path/fresh-build --directory .self-hosted-artifacts \
  --app-url https://ops.example.com --status-url https://status.ops.example.com \
  --share-url https://share.ops.example.com --edge-url wss://edge.ops.example.com \
  --ingest-url https://ingest.ops.example.com
```

Only Nitro's exact nested traced dependency tree is copied. Root/workspace `node_modules` are never staged. Native extensions, ELF/Mach-O/Windows executable magic, Pro package paths/imports, configuration/private-key files and escaping/absolute symlinks are rejected. Static image/font assets remain allowed. Internal relative Nitro dependency symlinks are preserved. The manifest binds source, artifact contents, free/self-hosted policy and all five expected origins, which must appear in the compiled browser assets. Env files, tests, README/verification documents and generated outputs are excluded from the build-source digest.

Transfer the source checkout and this explicit staged directory without env files or host dependencies. Then build on the runtime host with matching public arguments:

```bash
docker build -f deploy/self-hosted/Dockerfile.prebuilt -t outray-private-prebuilt:local \
  --build-arg APP_PUBLIC_URL=https://ops.example.com \
  --build-arg STATUS_PUBLIC_URL=https://status.ops.example.com \
  --build-arg SHARE_PUBLIC_URL=https://share.ops.example.com \
  --build-arg EDGE_PUBLIC_URL=wss://edge.ops.example.com \
  --build-arg INGEST_PUBLIC_URL=https://ingest.ops.example.com .
```

The Dockerfile-specific ignore rules admit the staged directory; the normal context excludes it. Verification runs before installation. Linux root/workspace dependencies are installed from the committed lockfile with lifecycle scripts disabled and no license, then asserted to have no Pro packs. Icon preparation runs explicitly in free mode. The exact audited Nitro trace is retained because replacing it with hoisted root dependencies can change dependency versions. Runtime behavior stays non-root, with committed migrations and restricted-role tooling available; the separate private rehearsal runner supplies read-only filesystems, internal networking and zero published ports.

This is not a general cross-platform native-artifact distribution or a production sizing guarantee. Verify the resulting image with the private rehearsal before further use. No command here deletes source, staged artifacts, volumes or databases. Keep the public manifest for provenance; retain internal credentials separately, never inside the artifact directory.
