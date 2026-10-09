export type LoginProvider = "github" | "google";
export type LoginCallbackError = "cancelled" | "failed";

export interface LoginSearch {
  redirect?: string;
  error?: LoginCallbackError;
}

/** OAuth callbacks stay local and retain invitation tokens and CLI login codes. */
export function normalizeLoginRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048 || !value.startsWith("/")
    || value.startsWith("//") || /[\\#\s\p{Cc}]/u.test(value) || /^\/%(?:2f|5c)/i.test(value)) return undefined;
  try {
    const url = new URL(value, "https://outray.invalid");
    if (url.origin !== "https://outray.invalid" || ["/login", "/signup"].includes(url.pathname.replace(/\/+$/, ""))) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function readLoginSearch(search?: Record<string, unknown>): LoginSearch {
  const redirect = normalizeLoginRedirect(search?.redirect);
  const error = typeof search?.error === "string" && search.error
    ? ["access_denied", "user_cancelled", "cancelled"].includes(search.error) ? "cancelled" : "failed"
    : undefined;
  return { ...(redirect ? { redirect } : {}), ...(error ? { error } : {}) };
}

export function loginCallbackErrorMessage(error?: LoginCallbackError): string | null {
  if (!error) return null;
  return error === "cancelled"
    ? "Sign-in was cancelled. Choose an option below to try again."
    : "Sign-in couldn’t be completed. Please try again.";
}

function authCallbacks(provider: LoginProvider, redirect: string | undefined, errorPath: "/login" | "/signup") {
  const destination = normalizeLoginRedirect(redirect);
  return {
    provider,
    callbackURL: destination ?? "/select",
    newUserCallbackURL: destination ?? "/onboarding",
    errorCallbackURL: destination ? `${errorPath}?${new URLSearchParams({ redirect: destination })}` : errorPath,
  };
}

export function loginCallbacks(provider: LoginProvider, redirect?: string) {
  return authCallbacks(provider, redirect, "/login");
}

export function signupCallbacks(provider: LoginProvider, redirect?: string) {
  return authCallbacks(provider, redirect, "/signup");
}

export function signupCallbackErrorMessage(error?: LoginCallbackError): string | null {
  if (!error) return null;
  return error === "cancelled"
    ? "Sign-up was cancelled. Choose an option below to try again."
    : "Sign-up couldn’t be completed. Please try again.";
}
