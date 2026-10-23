import { createFileRoute } from "@tanstack/react-router";
import { verifiedOAuthQuery } from "@/lib/mcp/consent";
export const Route = createFileRoute("/plugins/sign-in")({ server: { handlers: {
  GET: async ({ request }) => {
    const query = new URL(request.url).search.slice(1);
    try { await verifiedOAuthQuery(query); }
    catch { return new Response("This connection request is invalid or has expired", { status: 400 }); }
    const destination = `/plugins/continue?${query}`;
    return new Response(null, { status: 302, headers: { Location: `/login?${new URLSearchParams({ redirect: destination, reauth: "1" })}`, "Cache-Control": "no-store" } });
  },
} } });
