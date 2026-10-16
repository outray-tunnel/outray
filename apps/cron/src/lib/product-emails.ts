import { randomUUID } from "node:crypto";
import instancePolicy from "../../../../shared/instance-config";
import emailSender from "../../../../shared/email-sender";
import productEmail from "../../../../shared/product-email";
import type { ProductEmailDatabase } from "../../../../shared/product-email-outbox";

export const PRODUCT_EMAIL_POLL_INTERVAL_MS = 15_000;
const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 120;
const BATCH_SIZE = 10;

interface EmailRow {
  id: string;
  organization_id: string;
  recipient: string;
  payload: unknown;
  attempts: number;
}

class DeliveryError extends Error {
  constructor(message: string, readonly permanent = false, readonly configuration = false) { super(message); }
}

export function createProductEmailWorker(
  database: ProductEmailDatabase,
  options: {
    environment?: Record<string, string | undefined>;
    fetch?: typeof fetch;
    clock?: () => Date;
    logger?: Pick<Console, "error">;
  } = {},
) {
  const environment = options.environment ?? process.env;
  const request = options.fetch ?? fetch;
  const logger = options.logger ?? console;
  const workerId = randomUUID();
  let stopped = false;
  let active: Promise<void> | undefined;

  async function suppress(row: EmailRow) {
    await database.query(
      `UPDATE product_email_outbox SET status = 'suppressed', lease_owner = NULL,
         lease_until = NULL, last_error = NULL, updated_at = NOW()
       WHERE id = $1 AND lease_owner = $2`, [row.id, workerId],
    );
  }

  async function deliver(row: EmailRow) {
    try {
      let event;
      try { event = productEmail.parseProductEmailEvent(row.payload); }
      catch { throw new DeliveryError("Invalid stored email event", true); }
      if (event.kind === "usage-warning") {
        // Don't send expired monthly notices after a mail outage, or an 80%
        // warning that has already been superseded by a 100% event.
        if (new Date(event.resetsAt).getTime() <= (options.clock?.() ?? new Date()).getTime()) {
          await suppress(row);
          return;
        }
        if (event.threshold === 80) {
          const higher = await database.query(
            `SELECT 1 FROM product_email_outbox
             WHERE organization_id = $1 AND payload->>'kind' = 'usage-warning'
               AND payload->>'metric' = $2 AND payload->>'resetsAt' = $3
               AND payload->>'limitBytes' = $4
               AND payload->>'threshold' = '100' LIMIT 1`,
            [row.organization_id, event.metric, event.resetsAt, String(event.limitBytes)],
          );
          if (higher.rows.length) { await suppress(row); return; }
        }
      }
      // Membership and address are rechecked before delivery: a queued billing
      // message must not expose an organization to a removed/demoted member.
      const current = await database.query(
        `SELECT organization.name, organization.slug
         FROM organizations AS organization
         WHERE organization.id = $1 AND EXISTS (
           SELECT 1 FROM members AS member
           INNER JOIN users AS app_user ON app_user.id = member.user_id
           WHERE member.organization_id = organization.id
             AND member.role IN ('owner', 'admin')
             AND app_user.email_verified = true
             AND lower(app_user.email) = $2
         )`, [row.organization_id, row.recipient],
      );
      if (!current.rows.length) {
        await suppress(row);
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.recipient)) {
        throw new DeliveryError("Invalid recipient address", true);
      }
      const origin = environment.CONSOLE_PUBLIC_URL || environment.APP_URL || "https://outray.co";
      const context = current.rows[0];
      const billingUrl = new URL(`/${encodeURIComponent(context.slug)}/billing`, origin).toString();
      const { subject, html } = productEmail.renderProductEmail(event, {
        organizationName: context.name, billingUrl, assetBaseUrl: origin,
      });
      const from = emailSender.emailSender("OutRay", environment);
      let response: Response;
      try {
        response = await request("https://api.zeptomail.com/v1.1/email", {
          method: "POST",
          headers: {
            Accept: "application/json", "Content-Type": "application/json",
            Authorization: `Zoho-enczapikey ${environment.ZEPTO_API_KEY}`,
          },
          body: JSON.stringify({
            from,
            to: [{ email_address: { address: row.recipient } }],
            subject, htmlbody: html,
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch { throw new DeliveryError("Email provider request failed or timed out"); }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new DeliveryError(`Email provider authentication failed (HTTP ${response.status})`, false, true);
        }
        // Never persist raw provider bodies, which may echo credentials or PII.
        const permanent = response.status >= 400 && response.status < 500 &&
          ![408, 409, 425, 429].includes(response.status);
        throw new DeliveryError(`Email provider returned HTTP ${response.status}`, permanent);
      }
      await database.query(
        `UPDATE product_email_outbox SET status = 'sent', sent_at = NOW(),
           lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = NOW()
         WHERE id = $1 AND lease_owner = $2`, [row.id, workerId],
      );
    } catch (error) {
      const permanent = error instanceof DeliveryError && error.permanent;
      const configuration = error instanceof DeliveryError && error.configuration;
      const failed = !configuration && (permanent || row.attempts >= MAX_ATTEMPTS);
      const reason = error instanceof DeliveryError ? error.message : "Email processing failed";
      await database.query(
        `UPDATE product_email_outbox SET status = $3,
           next_attempt_at = NOW() + ($4 * INTERVAL '1 second'),
           attempts = GREATEST(attempts - $6, 0),
           lease_owner = NULL, lease_until = NULL, last_error = $5, updated_at = NOW()
         WHERE id = $1 AND lease_owner = $2`,
        [row.id, workerId, failed ? "failed" : "pending",
          configuration ? 300 : Math.min(3_600, 30 * 2 ** (row.attempts - 1)), reason, configuration ? 1 : 0],
      );
      logger.error(`[Product emails] Delivery ${row.id} ${failed ? "failed" : "will retry"}: ${reason}`);
    }
  }

  async function poll() {
    // Missing delivery configuration leaves queued messages pending, so adding
    // the key later does not burn the entire retry budget on configuration errors.
    if (stopped || !instancePolicy.instanceConfig(environment).billingEnabled || !environment.ZEPTO_API_KEY) return;
    emailSender.emailSender("OutRay", environment);
    await database.query(
      `UPDATE product_email_outbox SET status = 'failed', lease_owner = NULL,
         lease_until = NULL, last_error = 'Delivery retry budget exhausted', updated_at = NOW()
       WHERE status = 'processing' AND lease_until < NOW() AND attempts >= $1`, [MAX_ATTEMPTS],
    );
    const result = await database.query(
      `WITH due AS (
         SELECT id FROM product_email_outbox
         WHERE attempts < $1 AND next_attempt_at <= NOW()
           AND (status = 'pending' OR (status = 'processing' AND lease_until < NOW()))
         ORDER BY next_attempt_at, id
         LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       UPDATE product_email_outbox AS email
       SET status = 'processing', attempts = email.attempts + 1,
           lease_owner = $3, lease_until = NOW() + ($4 * INTERVAL '1 second'), updated_at = NOW()
       FROM due WHERE email.id = due.id
       RETURNING email.id, email.organization_id, email.recipient, email.payload, email.attempts`,
      [MAX_ATTEMPTS, BATCH_SIZE, workerId, LEASE_SECONDS],
    );
    await Promise.allSettled(result.rows.map((row: EmailRow) => deliver(row))).then(results => {
      if (results.some(result => result.status === "rejected")) {
        logger.error("[Product emails] Could not record a delivery result; expired leases will be retried");
      }
    });
  }

  return {
    run(): Promise<void> {
      if (stopped) return Promise.resolve();
      if (!active) active = poll().catch(() => {
        logger.error("[Product emails] Could not poll email queue");
      }).finally(() => { active = undefined; });
      return active;
    },
    async shutdown() { stopped = true; await active; },
  };
}
