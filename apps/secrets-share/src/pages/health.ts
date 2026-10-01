import type { APIRoute } from "astro";
import { shareDb } from "../lib/db";

export const GET: APIRoute = async () => {
  try {
    await shareDb().query("SELECT 1 FROM secret_share_links LIMIT 0");
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
};
