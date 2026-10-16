import { betterAuth } from "better-auth";
import { memberQuotaAdapter } from "./member-quota-adapter.server";
import { createAuthMiddleware, organization } from "better-auth/plugins";
import { sendViaZepto } from "./send-email";
import { ac, admin, member, owner } from "./permissions";
import { generateEmail } from "@/email/templates";
import { workspaceSlugErrorMessage, workspaceSlugRejection } from "../../../../shared/workspace-slugs";
import { assertOrganizationMemberCapacity } from "./member-limits.server";
import { BETTER_AUTH_MEMBERSHIP_CEILING } from "./member-limit-policy";
import { APIError } from "better-auth/api";
import { instanceConfig, instanceSignupAllowed } from "../../../../shared/instance-config";
import { adminProfileFields } from "./auth-profile";

export const auth = betterAuth({
  database: memberQuotaAdapter(),
  user: {
    additionalFields: adminProfileFields,
  },
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? { github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    } } : {}),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? { google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    } } : {}),
  },
  databaseHooks: {
    user: { create: { before: async (user) => {
      if (!instanceSignupAllowed(user)) {
        throw new APIError("FORBIDDEN", { message: "Signup is restricted on this installation. Contact your administrator." });
      }
      return { data: { ...user, isAdmin: false } };
    } } },
  },
  plugins: [
    organization({
      ac,
      // Plan-aware capacity is enforced atomically by the database adapter.
      // Hooks are an early check; Better Auth's static ceilings are safeguards.
      membershipLimit: BETTER_AUTH_MEMBERSHIP_CEILING,
      invitationLimit: BETTER_AUTH_MEMBERSHIP_CEILING,
      roles: {
        owner,
        admin,
        member,
      },
      organizationHooks: {
        beforeCreateInvitation: async ({ invitation }) => {
          await assertOrganizationMemberCapacity(invitation.organizationId, {
            includePendingInvitations: true,
          });
        },
        beforeAcceptInvitation: async ({ invitation }) => {
          await assertOrganizationMemberCapacity(invitation.organizationId, {
            includePendingInvitations: true,
            excludeInvitationEmail: invitation.email,
          });
        },
        beforeAddMember: async ({ member, user }) => {
          await assertOrganizationMemberCapacity(member.organizationId, {
            includePendingInvitations: true,
            excludeInvitationEmail: user.email,
          });
        },
      },
      sendInvitationEmail: async ({
        email,
        invitation,
        organization,
        inviter,
        role,
      }) => {
        const invitationLink = `${process.env.APP_URL}/invitations/accept?token=${invitation.id}`;
        const { html, subject } = generateEmail("organization-invite", {
          inviterName: inviter?.user.name || "Someone",
          organizationName: organization.name,
          role,
          invitationLink,
        });
        await sendViaZepto({
          recipientEmail: email,
          subject,
          htmlString: html,
        });
      },
    }),
  ],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Handle both direct sign-up and social auth callback
      const isSignUp = ctx.path.startsWith("/sign-up");
      const isCallback = ctx.path.startsWith("/callback");

      if (isSignUp || isCallback) {
        const newSession = ctx.context.newSession;

        if (newSession) {
          // Check if user was created within the last 30 seconds (new user)
          const createdAt = new Date(newSession.user.createdAt).getTime();
          const now = Date.now();
          const isNewUser = now - createdAt < 30000; // 30 seconds

          if (isNewUser && instanceConfig().marketingEnabled) {
            // Send welcome email
            try {
              const { html, subject } = generateEmail("welcome", {
                name: newSession.user.name || "User",
                dashboardUrl: `${process.env.APP_URL}/select`,
              });

              await sendViaZepto({
                recipientEmail: newSession.user.email,
                subject,
                htmlString: html,
                senderEmail: "akinkunmi@outray.co",
                senderName: "Akinkunmi from OutRay",
                replyToEmail: "akinkunmi@outray.co",
              });
              console.log("[Welcome Email] Sent to:", newSession.user.email);
            } catch (error) {
              console.error("[Welcome Email] Failed to send:", error);
            }

            // Subscribe to Plunk
            try {
              await fetch("https://next-api.useplunk.com/contacts", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.PLUNK_API_KEY}`,
                },
                body: JSON.stringify({
                  email: newSession.user.email,
                  subscribed: true,
                  data: {
                    signup: true,
                    name: newSession.user.name || "",
                  },
                }),
              });
              console.log("[Plunk] Subscribed:", newSession.user.email);
            } catch (error) {
              console.error("[Plunk] Failed to subscribe:", error);
            }
          }
        }
      }
    }),
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/organization/create") {
        const body = ctx.body as { slug?: unknown } | undefined;
        const reason = workspaceSlugRejection(body?.slug, instanceConfig());
        if (reason) {
          throw new APIError("BAD_REQUEST", { message: workspaceSlugErrorMessage(reason) });
        }
      }
    }),
  },
});
