import { createFileRoute, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useEffect, useRef, useState } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { loginCallbackErrorMessage, loginCallbacks, readLoginSearch, type LoginProvider } from "@/lib/login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log In - OutRay" },
    ],
  }),
  component: LoginRoute,
  validateSearch: readLoginSearch,
});

export function LoginRoute() {
  const [loading, setLoading] = useState<LoginProvider | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const { redirect, error } = Route.useSearch();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    mounted.current = true;
    // Browser Back from the provider can restore a still-busy page from BFCache.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        inFlight.current = false;
        setLoading(null);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      mounted.current = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (session?.user) {
    // href retains the return URL's query; to supplies the typed default route.
    return <Navigate to="/select" href={redirect ?? "/select"} replace />;
  }

  const handleLogin = async (provider: LoginProvider) => {
    if (inFlight.current || isPending) return;
    inFlight.current = true;
    setLoading(provider);
    setActionError(null);
    let redirecting = false;
    try {
      const result = await authClient.signIn.social(loginCallbacks(provider, redirect));
      // Better Auth's redirect plugin opens the provider; don't navigate twice.
      redirecting = !result.error && result.data?.redirect === true && Boolean(result.data.url);
      if (!redirecting && mounted.current) setActionError(`Could not continue with ${provider === "github" ? "GitHub" : "Google"}. Please try again.`);
    } catch {
      if (mounted.current) setActionError(`Could not continue with ${provider === "github" ? "GitHub" : "Google"}. Please try again.`);
    } finally {
      if (!redirecting) {
        inFlight.current = false;
        if (mounted.current) setLoading(null);
      }
    }
  };

  return <AuthPage loading={loading} sessionPending={isPending} redirect={redirect} error={loading ? null : actionError ?? loginCallbackErrorMessage(error)} onLogin={(provider) => { void handleLogin(provider); }} />;
}
