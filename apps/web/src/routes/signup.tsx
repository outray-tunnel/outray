import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { FaGithub, FaGoogle } from "react-icons/fa";
import { useState } from "react";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign Up - OutRay" },
    ],
  }),
  component: RouteComponent,
  validateSearch: (search?: Record<string, unknown>): { redirect?: string } => {
    return {
      redirect: (search?.redirect as string) || undefined,
    };
  },
});

function RouteComponent() {
  const [loading, setLoading] = useState<string | null>(null);
  const { redirect } = Route.useSearch();
  const { data: session } = authClient.useSession();

  if (session?.user) {
    return <Navigate to="/select" />;
  }

  const handleSignup = async (provider: "github" | "google") => {
    setLoading(provider);
    await authClient.signIn.social({
      provider,
      callbackURL: redirect || "/select",
      newUserCallbackURL: redirect || "/onboarding",
    });
    setLoading(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070707] text-gray-300">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center mb-12">
          <Link to="/" className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo.png" alt="OutRay Logo" className="w-12" />
            <p className="font-bold text-white text-2xl tracking-tight">
              OutRay
            </p>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Create an account
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Sign up to get started with OutRay
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => handleSignup("github")}
            disabled={loading !== null}
            isLoading={loading === "github"}
            leftIcon={loading !== "github" ? <FaGithub className="h-5 w-5" /> : undefined}
          >
            Continue with GitHub
          </Button>

          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => handleSignup("google")}
            disabled={loading !== null}
            isLoading={loading === "google"}
            leftIcon={loading !== "google" ? <FaGoogle className="h-5 w-5" /> : undefined}
          >
            Continue with Google
          </Button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-8">
          By continuing, you agree to OutRay's Terms of Service and Privacy
          Policy
        </p>
      </div>
    </div>
  );
}
