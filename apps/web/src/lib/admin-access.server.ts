import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/auth-schema";
import { auth } from "./auth";

const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/** Admin data must never be reusable by a shared cache or a signed-out browser. */
export function adminJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return Response.json(data, { ...init, headers });
}

/** Cookie-authenticated admin writes must originate from this console. */
function hasTrustedOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;

  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  if (!source) return false;

  try {
    const sourceUrl = new URL(source);
    const targetUrl = new URL(request.url);
    if (!/^https?:$/.test(sourceUrl.protocol)) return false;
    // Origin must be a serialized origin, not a path or an opaque origin.
    if (origin !== null && sourceUrl.origin !== origin) return false;
    return sourceUrl.origin === targetUrl.origin;
  } catch {
    return false;
  }
}

/**
 * Platform access is a property of the current user record, never an
 * organization role or a value cached in the browser/session. Bearer tokens
 * from the retired admin password login are deliberately not accepted.
 */
export async function resolveAdminAccess(request: Request): Promise<{
  user: { id: string; name: string; email: string; isAdmin: true };
} | Response> {
  if (!readMethods.has(request.method.toUpperCase()) && !hasTrustedOrigin(request)) {
    return adminJson({ error: "This request must come from the OutRay console." }, { status: 403 });
  }

  const headers = new Headers(request.headers);
  headers.delete("authorization");
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!session?.user?.id) {
    return adminJson({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (user?.isAdmin !== true) {
    return adminJson({ error: "Forbidden" }, { status: 403 });
  }
  return { user: { id: user.id, name: user.name, email: user.email, isAdmin: true } };
}

export async function requireAdminAccess(request: Request): Promise<Response | null> {
  const access = await resolveAdminAccess(request);
  return access instanceof Response ? access : null;
}
