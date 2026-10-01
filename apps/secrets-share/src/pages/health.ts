import type { APIRoute } from "astro";
import { shareDb } from "../lib/db";

let lastFailure: string | undefined;

export const GET: APIRoute = async () => {
  try {
    await shareDb().query("SELECT 1 FROM secret_share_links LIMIT 0");
    lastFailure = undefined;
    return new Response(null, { status: 204 });
  } catch (error) {
    // Log only a safe error code, never a connection URL or database message.
    const code = !process.env.SHARE_DATABASE_URL ? "missing_database_url" :
      typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code :
      "database_check_failed";
    if (code !== lastFailure) {
      console.error(`[Secrets Share] health check failed: ${code}`);
      lastFailure = code;
    }
    return new Response("Unavailable", { status: 503 });
  }
};
