// Local workerd fixture only. Production uses Hyperdrive-backed authentication.
import {
  consumeBatch,
  enqueueRecords,
  type IngestMessage,
  type WorkerDeliveryEnv,
} from "../../src/worker/delivery.js";
import { handleIngestRequest } from "../../src/worker/http.js";
import { OrganizationRateLimiter } from "../../src/worker/index.js";

export { OrganizationRateLimiter };

interface FixtureEnv extends WorkerDeliveryEnv {
  ORG_RATE_LIMITER: DurableObjectNamespace<OrganizationRateLimiter>;
}

export default {
  async fetch(request: Request, env: FixtureEnv) {
    const url = new URL(request.url);
    if (url.pathname === "/test-rate-limit") {
      const organizationId = url.searchParams.get("org") ?? "org-rate-limit";
      const limiter = env.ORG_RATE_LIMITER.get(
        env.ORG_RATE_LIMITER.idFromName(organizationId),
      );
      const allowed = await limiter.allow();
      return Response.json({
        allowed,
        minute: Math.floor(Date.now() / 60_000),
      });
    }
    return handleIngestRequest(request, {
      async authenticate(key) {
        return key === "outray_test_runtime"
          ? {
              organizationId: "org_runtime",
              retentionDays: 3,
              telemetryBytesPerMonth: 1024 ** 3,
              tokenId: "test-runtime",
            }
          : null;
      },
      async allowRequest() {
        return true;
      },
      enqueue: (signal, rows) => enqueueRecords(env, signal, rows),
    });
  },
  queue(batch: MessageBatch<IngestMessage>, env: WorkerDeliveryEnv) {
    return consumeBatch(batch, env);
  },
} satisfies ExportedHandler<FixtureEnv, IngestMessage>;
