import { createFileRoute } from "@tanstack/react-router";
import { adminJson, resolveAdminAccess } from "../../../lib/admin-access.server";

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const access = await resolveAdminAccess(request);
        if (access instanceof Response) return access;
        return adminJson({ user: access.user });
      },
      // Shared passphrases and legacy Redis bearer tokens have been retired.
      POST: async () => adminJson(
        { error: "Sign in with GitHub or Google to access your admin profile." },
        { status: 405, headers: { Allow: "GET" } },
      ),
    },
  },
});
