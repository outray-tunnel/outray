import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";
import {
  Building2,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();

  const validateSlug = useCallback((value: string) => {
    if (!/^[a-z0-9-]+$/.test(value)) {
      return "Slug can only contain lowercase letters, numbers, and hyphens.";
    }
    if (value.includes("--")) {
      return "Slug cannot contain consecutive hyphens.";
    }
    if (value.startsWith("-") || value.endsWith("-")) {
      return "Slug cannot start or end with a hyphen.";
    }
    return null;
  }, []);

  const checkSlugAvailability = useCallback(
    async (slugToCheck: string) => {
      if (!slugToCheck) {
        setIsSlugAvailable(null);
        return;
      }

      const validationError = validateSlug(slugToCheck);
      if (validationError) {
        setIsSlugAvailable(false);
        setError(validationError);
        return;
      }

      setIsCheckingSlug(true);
      try {
        const data = await appClient.organizations.checkSlug(slugToCheck);

        if ("error" in data) {
          setIsSlugAvailable(false);
          setError(data.error || "Failed to check slug availability.");
          return;
        }

        if (data.available) {
          setIsSlugAvailable(true);
          setError(null);
        } else {
          setIsSlugAvailable(false);
          setError(
            data.reason === "reserved"
              ? "This slug is reserved. Contact support@outray.dev to claim it."
              : "This slug is already taken.",
          );
        }
      } catch (error) {
        console.error("Failed to check slug:", error);
      } finally {
        setIsCheckingSlug(false);
      }
    },
    [validateSlug],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (slug) {
        checkSlugAvailability(slug);
      } else {
        setIsSlugAvailable(null);
        setError(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, checkSlugAvailability]);

  if (sessionPending) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <img src="/logo.png" alt="OutRay" className="w-16 h-16 animate-pulse" />
      </div>
    );
  }

  if (!sessionData?.session.id) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSlugAvailable === false) {
      return;
    }

    const slugError = validateSlug(slug);
    if (slugError) {
      setError(slugError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await authClient.organization.create({
        name,
        slug,
      });

      if (error) {
        console.error(error);
        if (
          error.code === "DUPLICATE_SLUG" ||
          error.code === "ORGANIZATION_ALREADY_EXISTS" ||
          error.message?.toLowerCase().includes("slug")
        ) {
          setError("This slug is already taken. Please choose another one.");
          setIsSlugAvailable(false);
        } else {
          setError(error.message || "Failed to create organization.");
        }
        return;
      }

      if (data) {
        await authClient.organization.setActive({
          organizationId: data.id,
        });

        navigate({ to: "/$orgSlug/install", params: { orgSlug: data.slug } });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white relative overflow-hidden selection:bg-white/20">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-white/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-white/5 blur-[120px]" />
      </div>
      <div className="w-full max-w-md relative z-10 p-6">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-black/50 backdrop-blur-sm group">
            <Building2
              size={32}
              className="text-white group-hover:text-accent transition-colors duration-500"
            />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Create Organization
          </h2>
          <p className="mt-2 text-gray-400">
            Set up your workspace to get started
          </p>
        </div>

        <div className="bg-white/2 border border-white/5 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-400 mb-1.5"
                >
                  Organization Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setName(newName);

                    // Auto-generate slug if it matches the previous pattern or is empty
                    const currentSlugPattern = name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "");
                    if (!slug || slug === currentSlugPattern) {
                      setSlug(
                        newName
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-+/, "")
                          .replace(/-+$/, ""),
                      );
                    }
                  }}
                  className="block w-full rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-white placeholder-white/20 outline-none transition-all focus:border-accent/50 focus:bg-black/40 focus:ring-1 focus:ring-accent/50"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label
                  htmlFor="slug"
                  className="block text-sm font-medium text-gray-400 mb-1.5"
                >
                  Organization Slug
                </label>
                <div className="relative">
                  <input
                    id="slug"
                    name="slug"
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setError(null);
                      setIsSlugAvailable(null);
                    }}
                    className={`block w-full rounded-2xl border bg-black/20 px-4 py-3 text-white placeholder-white/20 outline-none transition-all focus:bg-black/40 focus:ring-1 font-mono text-sm ${
                      error
                        ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/50"
                        : isSlugAvailable
                          ? "border-green-500/50 focus:border-green-500 focus:ring-green-500/50"
                          : "border-white/5 focus:border-accent/50 focus:ring-accent/50"
                    }`}
                    placeholder="acme-corp"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {isCheckingSlug ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-gray-400"
                      />
                    ) : isSlugAvailable === true ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : isSlugAvailable === false ? (
                      <XCircle size={16} className="text-red-500" />
                    ) : null}
                  </div>
                </div>
                {error && (
                  <p className="mt-1.5 text-xs text-red-400">{error}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isCheckingSlug || !!error}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-white hover:bg-accent px-4 py-3.5 text-sm font-bold text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-white/5 hover:shadow-accent/20"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
              ) : (
                <>
                  Create Organization
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">
          By creating an organization, you agree to our{" "}
          <a
            href="#"
            className="text-gray-400 hover:text-white underline decoration-gray-600 underline-offset-2"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="#"
            className="text-gray-400 hover:text-white underline decoration-gray-600 underline-offset-2"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
