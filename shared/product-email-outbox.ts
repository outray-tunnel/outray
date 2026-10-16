import { randomUUID } from "node:crypto";
import instancePolicy from "./instance-config";
import productEmail, { type ProductEmailEvent } from "./product-email";

/** Pool and transaction clients both implement this interface. Producers should
 * enqueue using the same transaction as the state change that caused an email. */
export interface ProductEmailDatabase {
  query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export async function enqueueProductEmail(
  database: ProductEmailDatabase,
  input: { organizationId: string; eventKey: string; event: ProductEmailEvent },
): Promise<number> {
  if (!instancePolicy.instanceConfig().billingEnabled) return 0;
  if (!input.organizationId || input.organizationId.length > 256 ||
      !input.eventKey || input.eventKey.length > 512) {
    throw new Error("Invalid product email event identity");
  }
  const event = productEmail.parseProductEmailEvent(input.event);
  // Recipients are derived from membership, never accepted from webhook data.
  // Distinct addresses also handle installations with legacy duplicate members.
  const result = await database.query(
    `INSERT INTO product_email_outbox (id, organization_id, recipient, payload, dedupe_key)
     SELECT $1 || ':' || md5(recipient), $2, recipient, $4::jsonb,
            jsonb_build_array($2::text, $3::text, recipient)::text
     FROM (
       SELECT DISTINCT lower(app_user.email) AS recipient
       FROM members AS member
       INNER JOIN users AS app_user ON app_user.id = member.user_id
       WHERE member.organization_id = $2
         AND member.role IN ('owner', 'admin')
         AND app_user.email_verified = true
     ) AS recipients
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [randomUUID(), input.organizationId, input.eventKey, JSON.stringify(event)],
  );
  return result.rowCount ?? result.rows.length;
}

export default { enqueueProductEmail };
