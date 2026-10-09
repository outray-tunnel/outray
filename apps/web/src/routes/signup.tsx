import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { authClient } from "@/lib/auth-client";
import { readLoginSearch, signupCallbackErrorMessage, signupCallbacks, type LoginProvider } from "@/lib/login";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign Up - OutRay" }] }),
  component: SignupRoute,
  validateSearch: readLoginSearch,
});

export function SignupRoute() {
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
    // Preserve invitation tokens and CLI codes for people already signed in.
    return <Navigate to="/select" href={redirect ?? "/select"} replace />;
  }

  const handleSignup = async (provider: LoginProvider) => {
    if (inFlight.current || isPending) return;
    inFlight.current = true;
    setLoading(provider);
    setActionError(null);
    let redirecting = false;
    try {
      const result = await authClient.signIn.social(signupCallbacks(provider, redirect));
      // Better Auth opens the provider; retain the busy state until navigation.
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

  return <AuthPage mode="signup" loading={loading} sessionPending={isPending} redirect={redirect} error={loading ? null : actionError ?? signupCallbackErrorMessage(error)} onLogin={(provider) => { void handleSignup(provider); }} />;
}
