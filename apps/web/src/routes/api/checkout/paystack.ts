import { createFileRoute } from "@tanstack/react-router";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../lib/auth";
import {
  initializeTransaction,
  PAYSTACK_PRICES_KOBO,
  type PaystackPlan,
} from "../../../lib/paystack";
import { db } from "../../../db";
import { organizations, members } from "../../../db/schema";

export const Route = createFileRoute("/api/checkout/paystack")({
  server: {
    handlers: {
      /**
       * GET /api/checkout/paystack?plan=beam&orgSlug=my-org
       *
       * Initializes a Paystack transaction and returns the access_code
       * for opening the Paystack popup on the frontend.
       */
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const plan = url.searchParams.get("plan") as PaystackPlan | null;
        const orgSlug = url.searchParams.get("orgSlug");

        // Validate plan
        if (!plan || !["ray", "beam", "pulse"].includes(plan)) {
          return Response.json(
            { error: "Invalid plan. Must be ray, beam, or pulse." },
            { status: 400 },
          );
        }

        // Validate organization slug
        if (!orgSlug) {
          return Response.json(
            { error: "Organization slug is required." },
            { status: 400 },
          );
        }

        // Get user session
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          return Response.json({ error: "Authentication required." }, { status: 401 });
        }

        // Verify organization exists
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.slug, orgSlug),
        });

        if (!org) {
          return Response.json(
            { error: "Organization not found." },
            { status: 404 },
          );
        }

        // Verify user membership
        const membership = await db.query.members.findFirst({
          where: and(
            eq(members.organizationId, org.id),
            eq(members.userId, session.user.id),
          ),
        });

        if (!membership) {
          return Response.json(
            { error: "You are not a member of this organization." },
            { status: 403 },
          );
        }

        // Only allow owner/admin to manage subscriptions
        if (!["owner", "admin"].includes(membership.role)) {
          return Response.json(
            { error: "Only organization owners and admins can manage subscriptions." },
            { status: 403 },
          );
        }

        const email = session.user.email;
        if (!email) {
          return Response.json(
            { error: "User email is required for Paystack checkout." },
            { status: 400 },
          );
        }

        try {
          const amount = PAYSTACK_PRICES_KOBO[plan];

          const result = await initializeTransaction({
            email,
            amount,
            metadata: {
              organizationId: org.id,
              plan,
              userId: session.user.id,
            },
          });

          return Response.json({
            success: true,
            accessCode: result.data.access_code,
            reference: result.data.reference,
            authorizationUrl: result.data.authorization_url,
          });
        } catch (error) {
          console.error("[Paystack Checkout] Error:", error);
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to initialize payment",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
