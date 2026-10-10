import { DurableObject } from "cloudflare:workers";
import { Client } from "pg";
import { authenticateApiToken } from "../auth.js";
import {
  consumeBatch,
  enqueueRecords,
  type IngestMessage,
} from "./delivery.js";
import { handleIngestRequest } from "./http.js";
import { nextRateWindow, type RateWindow } from "./rate-limit.js";

export class OrganizationRateLimiter extends DurableObject<Env> {
  async allow(): Promise<boolean> {
    // Storage transactions serialize concurrent exports across every location.
    return this.ctx.storage.transaction(async (transaction) => {
      const result = nextRateWindow(
        await transaction.get<RateWindow>("window"),
        Date.now(),
        600,
      );
      await transaction.put("window", result.window);
      await transaction.setAlarm((result.window.minute + 2) * 60_000);
      return result.allowed;
    });
  }

  async alarm() {
    await this.ctx.storage.transaction(async (transaction) => {
      const window = await transaction.get<RateWindow>("window");
      if (window && (window.minute + 2) * 60_000 > Date.now()) {
        await transaction.setAlarm((window.minute + 2) * 60_000);
      } else {
        await transaction.delete("window");
      }
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    let client: Client | undefined;
    const background: Promise<unknown>[] = [];
    try {
      return await handleIngestRequest(request, {
        async authenticate(apiKey) {
          if (!apiKey.startsWith("outray_")) return null;
          client = new Client({
            connectionString: env.HYPERDRIVE.connectionString,
            connectionTimeoutMillis: 10_000,
            query_timeout: 10_000,
          });
          await client.connect();
          return authenticateApiToken(client, apiKey, {
            environment: {
              OUTRAY_DEPLOYMENT_MODE: env.OUTRAY_DEPLOYMENT_MODE,
              OUTRAY_PRODUCTS: env.OUTRAY_PRODUCTS,
              OUTRAY_RETENTION_DAYS: env.OUTRAY_RETENTION_DAYS,
            },
            backgroundTask: (task) => background.push(task),
          });
        },
        async allowRequest(organizationId) {
          const limiter = env.ORG_RATE_LIMITER.get(
            env.ORG_RATE_LIMITER.idFromName(organizationId),
          );
          return limiter.allow();
        },
        enqueue: (signal, records) => enqueueRecords(env, signal, records),
      });
    } finally {
      const connection = client;
      if (connection)
        ctx.waitUntil(
          Promise.allSettled(background)
            .then(() => connection.end())
            .catch(() => {
              console.error("Ingestion database client cleanup failed");
            }),
        );
    }
  },
  async queue(batch, env) {
    await consumeBatch(batch, env);
  },
} satisfies ExportedHandler<Env, IngestMessage>;
