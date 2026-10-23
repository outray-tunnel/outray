import { useState } from "react";
import { normalizeLoginRedirect } from "@/lib/login";

export function EmailSignIn({ redirect, disabled }: { redirect?: string; disabled: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  return <form className="mt-5 grid gap-3 border-t border-white/10 pt-5" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true); setMessage(""); setError(false);
    try {
      const destination = normalizeLoginRedirect(redirect);
      const errorQuery = new URLSearchParams({ error: "failed", ...(destination ? { redirect: destination } : {}),
        ...(destination?.startsWith("/plugins/continue?") ? { reauth: "1" } : {}) });
      const response = await fetch("/api/auth/sign-in/magic-link", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, callbackURL: destination ?? "/select", errorCallbackURL: `/login?${errorQuery}` }) });
      if (!response.ok) throw new Error();
      setMessage("Check your email for a sign-in link. If the address is eligible, a link will arrive shortly.");
    } catch { setError(true); setMessage("The sign-in email could not be sent. Try again later."); }
    finally { setBusy(false); }
  }}>
    <label htmlFor="sign-in-email" className="text-xs text-zinc-400">Or continue with email</label>
    <input id="sign-in-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy || disabled}
      className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-violet-400 disabled:opacity-50" placeholder="you@example.com" />
    <button type="submit" disabled={busy || disabled} className="rounded-lg border border-white/15 px-3 py-2.5 text-sm hover:bg-white/5 disabled:opacity-50">{busy ? "Sending…" : "Email me a sign-in link"}</button>
    {message && <p role={error ? "alert" : "status"} className={`text-xs leading-5 ${error ? "text-rose-300" : "text-zinc-400"}`}>{message}</p>}
  </form>;
}
