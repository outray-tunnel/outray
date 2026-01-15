import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { createAuthMiddleware, organization } from "better-auth/plugins";
import { sendViaZepto } from "./send-email";
import { ac, admin, member, owner } from "./permissions";
import { generateEmail } from "@/email/templates";
import { isReservedSlug } from "../../../../shared/reserved-slugs";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [
    organization({
      ac,
      roles: {
        owner,
        admin,
        member,
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
        sendViaZepto({
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

          if (isNewUser) {
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
                senderEmail: "akinkunmi@outray.dev",
                senderName: "Akinkunmi from OutRay",
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
        const body = ctx.body as { slug?: string } | undefined;
        if (body?.slug && isReservedSlug(body.slug)) {
          throw new Error("This slug is reserved");
        }
      }
    }),
  },
});
