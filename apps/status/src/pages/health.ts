import type { APIRoute } from "astro";
import { getStatusConfig } from "../lib/config";
import { query } from "../lib/db";

export const GET: APIRoute = async () => {
  try {
    if (!getStatusConfig().enabled) return new Response("disabled", { status: 503 });
    await query("SELECT id FROM uptime_status_pages LIMIT 1");
    return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};
