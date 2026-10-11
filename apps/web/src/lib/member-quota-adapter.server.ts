import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "../db";
import { invitations, members, users } from "../db/auth-schema";
import { assertOrganizationMemberCapacity } from "./member-limits.server";
import { withOrganizationQuotaLock } from "./organization-entitlements.server";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type Invitation = { id: string; organizationId: string; email: string; status: string; expiresAt: Date };

/** Preserve Better Auth's adapter and endpoint behavior, but serialize seat
 * allocation at the write itself. Transactions contain only database work—not
 * request validation, email delivery, sessions, or a whole auth request. */
export function memberQuotaAdapter(database: typeof db = db): AdapterFactory {
  const adapterConfig = { provider: "pg", usePlural: true } as const;
  return (options) => {
    const adapter = drizzleAdapter(database, adapterConfig)(options);
    const wrapped: Adapter = {
      ...adapter,
      create: async <T extends Record<string, any>, R = T>(args: {
        model: string; data: Omit<T, "id">; select?: string[]; forceAllowId?: boolean;
      }): Promise<R> => {
        if (args.model !== "member" && args.model !== "invitation") return adapter.create<T, R>(args);
        const organizationId = args.data.organizationId;
        if (typeof organizationId !== "string") throw new APIError("BAD_REQUEST", { message: "Organization is required." });

        return database.transaction(async (tx) => {
          await withOrganizationQuotaLock(tx, organizationId);
          const writer = drizzleAdapter(tx, adapterConfig)(options);
          const completeReservation = async (email: string) => tx.update(invitations).set({ expiresAt: new Date() }).where(and(
            eq(invitations.organizationId, organizationId),
            sql`lower(${invitations.email}) = lower(${email})`,
            sql`${invitations.status} IN ('pending', 'accepted')`,
          ));
          let excludeInvitationEmail: string | undefined;
          if (args.model === "member") {
            const user = await writer.findOne<{ email: string }>({ model: "user", where: [{ field: "id", value: args.data.userId }] });
            if (!user) throw new APIError("BAD_REQUEST", { message: "User not found." });
            const existing = await writer.findOne<R>({ model: "member", where: [
              { field: "organizationId", value: organizationId }, { field: "userId", value: args.data.userId },
            ] });
            // Concurrent acceptance of the same invitation must not create two
            // member rows (the auth schema does not have a composite unique key).
            if (existing) { await completeReservation(user.email); return existing; }
            excludeInvitationEmail = user.email;
          } else {
            const email = args.data.email;
            if (typeof email !== "string") throw new APIError("BAD_REQUEST", { message: "Invitation email is required." });
            const member = await tx.select({ id: members.id }).from(members).innerJoin(users, eq(users.id, members.userId)).where(and(
              eq(members.organizationId, organizationId), sql`lower(${users.email}) = lower(${email})`,
            )).limit(1);
            if (member.length) throw new APIError("BAD_REQUEST", { message: "This user is already a member of this organization." });
            const existing = await tx.select({ id: invitations.id }).from(invitations).where(and(
              eq(invitations.organizationId, organizationId),
              sql`lower(${invitations.email}) = lower(${email})`,
              sql`${invitations.status} IN ('pending', 'accepted')`,
              gt(invitations.expiresAt, new Date()),
            )).limit(1);
            if (existing.length) throw new APIError("BAD_REQUEST", { message: "This user already has an invitation to this organization." });
          }
          await assertOrganizationMemberCapacity(organizationId, { includePendingInvitations: true, excludeInvitationEmail }, tx);
          const created = await writer.create<T, R>(args);
          if (excludeInvitationEmail) {
            // Complete the transferred reservation in the same commit. A later
            // member removal must not resurrect an old accepted invitation as
            // a seat, and a direct add makes any pending invitation obsolete.
            await completeReservation(excludeInvitationEmail);
          }
          return created;
        });
      },
      update: async (args) => {
        // Resending an expired invitation allocates a seat again. Acceptance
        // validates inside the lock before converting its existing reservation.
        if (args.model !== "invitation" || (!Object.hasOwn(args.update, "expiresAt") && !["accepted", "pending"].includes(args.update.status))) return adapter.update(args);
        const invitation = await adapter.findOne<Invitation>({ model: "invitation", where: args.where });
        if (!invitation) return null;
        return database.transaction(async (tx) => {
          await withOrganizationQuotaLock(tx, invitation.organizationId);
          const writer = drizzleAdapter(tx, adapterConfig)(options);
          const current = await writer.findOne<Invitation>({ model: "invitation", where: args.where });
          if (!current) return null;
          const now = new Date();
          if (args.update.status === "accepted") {
            if (current.status !== "pending" || current.expiresAt <= now) throw new APIError("BAD_REQUEST", { message: "This invitation is no longer pending." });
            if (Object.hasOwn(args.update, "expiresAt") && new Date(args.update.expiresAt) > current.expiresAt) throw new APIError("BAD_REQUEST", { message: "Acceptance cannot extend an invitation." });
            await assertOrganizationMemberCapacity(current.organizationId, { includePendingInvitations: true, excludeInvitationEmail: current.email }, tx);
          } else {
            if (current.status !== "pending") throw new APIError("BAD_REQUEST", { message: "Only pending invitations can be renewed." });
            if (current.expiresAt <= now && new Date(args.update.expiresAt) > now) {
              await assertOrganizationMemberCapacity(current.organizationId, { includePendingInvitations: true }, tx);
            }
          }
          return writer.update(args);
        });
      },
      // Better Auth's configured adapter currently executes these callbacks
      // sequentially. Preserve its transaction contract and keep decorated seat
      // writes when it supplies an adapter to internal auth operations.
      transaction: (callback) => adapter.transaction((transactionAdapter) => callback({
        ...transactionAdapter, create: wrapped.create, update: wrapped.update,
      })),
    };
    return wrapped;
  };
}
