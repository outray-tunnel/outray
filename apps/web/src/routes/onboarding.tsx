import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Building06Icon from "@outray/icons/stroke/Building06Icon";
import CancelCircleIcon from "@outray/icons/stroke/CancelCircleIcon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useInstance } from "@/lib/instance-context";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [{ title: "Create a workspace - OutRay" }],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { workspaceUrlPrefix } = useInstance();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const setSelectedOrganization = useAppStore(
    (state) => state.setSelectedOrganization,
  );
  const { data: sessionData, isPending: sessionPending } =
    authClient.useSession();

  const validateSlug = useCallback((value: string) => {
    if (!/^[a-z0-9-]+$/.test(value)) {
      return "Use lowercase letters, numbers, and hyphens only.";
    }
    if (value.includes("--")) {
      return "The workspace URL cannot contain consecutive hyphens.";
    }
    if (value.startsWith("-") || value.endsWith("-")) {
      return "The workspace URL cannot start or end with a hyphen.";
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
          setError(data.error || "We could not check this workspace URL.");
          return;
        }

        if (data.available) {
          setIsSlugAvailable(true);
          setError(null);
        } else {
          setIsSlugAvailable(false);
          setError(
            data.reason === "reserved"
              ? "This URL is reserved. Contact support@outray.dev to claim it."
              : data.reason === "route"
                ? "This URL is used by the application. Choose a different workspace URL."
                : "This workspace URL is already in use.",
          );
        }
      } catch (checkError) {
        console.error("Failed to check slug:", checkError);
        setIsSlugAvailable(false);
        setError("We could not check this workspace URL. Try again.");
      } finally {
        setIsCheckingSlug(false);
      }
    },
    [validateSlug],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (slug) {
        void checkSlugAvailability(slug);
      } else {
        setIsSlugAvailable(null);
        setError(null);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [slug, checkSlugAvailability]);

  if (sessionPending) {
    return <OnboardingSkeleton />;
  }

  if (!sessionData?.session.id) {
    return <Navigate to="/login" replace />;
  }

  const handleNameChange = (nextName: string) => {
    const previousGeneratedSlug = toSlug(name);
    setName(nextName);
    if (!slug || slug === previousGeneratedSlug) {
      setSlug(toSlug(nextName));
      setError(null);
      setIsSlugAvailable(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSlugAvailable === false) return;

    const slugError = validateSlug(slug);
    if (slugError) {
      setError(slugError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: createError } =
        await authClient.organization.create({
          name: name.trim(),
          slug,
        });

      if (createError) {
        if (
          createError.code === "DUPLICATE_SLUG" ||
          createError.code === "ORGANIZATION_ALREADY_EXISTS" ||
          createError.message?.toLowerCase().includes("slug")
        ) {
          setError("This workspace URL is already in use.");
          setIsSlugAvailable(false);
        } else {
          setError(createError.message || "We could not create this workspace.");
        }
        return;
      }

      if (data) {
        await authClient.organization.setActive({ organizationId: data.id });
        setSelectedOrganization(data);
        await navigate({
          to: "/$orgSlug/get-started",
          params: { orgSlug: data.slug },
        });
      }
    } catch (createError) {
      console.error("Failed to create workspace:", createError);
      setError("We could not create this workspace. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const user = sessionData.user;

  return (
    <main className="min-h-screen bg-[#080808] text-white selection:bg-white/15">
      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex h-[76px] w-full max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="OutRay home">
            <img src="/logo.png" alt="" className="size-9 object-contain" />
            <span className="text-[18px] font-semibold tracking-[-0.025em]">
              OutRay
            </span>
          </Link>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-[13px] font-medium text-zinc-200">
                {user.name || "Your account"}
              </p>
              <p className="max-w-60 truncate text-[12px] text-zinc-600">
                {user.email}
              </p>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[12px] font-semibold text-zinc-200">
              {getInitials(user.name || user.email)}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.3fr)] lg:gap-20 lg:py-24">
        <section className="lg:sticky lg:top-16 lg:self-start">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045]">
            <HugeiconsIcon
              icon={Building06Icon}
              size={23}
              strokeWidth={1.7}
              className="text-zinc-300"
            />
          </div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            New workspace
          </p>
          <h1 className="max-w-md text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[44px]">
            Bring your team into OutRay.
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-zinc-500">
            A workspace keeps your tunnels, telemetry, secrets, members, and
            billing together.
          </p>

          <Link
            to="/select"
            className="mt-8 inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13px] font-medium text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.075] hover:text-white"
          >
            Back to workspaces
          </Link>
        </section>

        <section aria-labelledby="create-workspace-title" className="min-w-0">
          <div className="rounded-[26px] border border-white/[0.09] bg-[#0b0b0b]">
            <div className="border-b border-white/[0.075] px-6 py-6 sm:px-8 sm:py-7">
              <h2
                id="create-workspace-title"
                className="text-[19px] font-semibold tracking-[-0.025em]"
              >
                Create your workspace
              </h2>
              <p className="mt-1.5 text-[13px] leading-5 text-zinc-600">
                You can invite members and configure products after setup.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-7 sm:px-8 sm:py-8">
              <div className="space-y-7">
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2.5 block text-[13px] font-medium text-zinc-300"
                  >
                    Workspace name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    autoFocus
                    autoComplete="organization"
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    className="h-13 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-[15px] text-white outline-none transition-colors placeholder:text-zinc-700 hover:border-white/15 focus:border-white/25 focus:bg-black/30"
                    placeholder="Acme"
                  />
                  <p className="mt-2 text-[12px] leading-5 text-zinc-700">
                    Use the name your team will recognize.
                  </p>
                </div>

                <div>
                  <div className="mb-2.5 flex items-center justify-between gap-4">
                    <label
                      htmlFor="slug"
                      className="block text-[13px] font-medium text-zinc-300"
                    >
                      Workspace URL
                    </label>
                    <SlugStatus
                      checking={isCheckingSlug}
                      available={isSlugAvailable}
                    />
                  </div>

                  <div
                    className={`flex h-13 items-center overflow-hidden rounded-2xl border bg-black/20 transition-colors focus-within:bg-black/30 ${
                      error
                        ? "border-red-500/35 focus-within:border-red-500/55"
                        : isSlugAvailable
                          ? "border-emerald-500/30 focus-within:border-emerald-500/45"
                          : "border-white/10 hover:border-white/15 focus-within:border-white/25"
                    }`}
                  >
                    <span className="max-w-[55%] shrink-0 truncate border-r border-white/[0.075] px-4 font-mono text-[13px] text-zinc-600" title={workspaceUrlPrefix}>
                      {workspaceUrlPrefix}
                    </span>
                    <input
                      id="slug"
                      name="slug"
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck={false}
                      value={slug}
                      onChange={(event) => {
                        setSlug(event.target.value.toLowerCase());
                        setError(null);
                        setIsSlugAvailable(null);
                      }}
                      className="min-w-0 flex-1 bg-transparent px-4 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-700"
                      placeholder="acme"
                    />
                  </div>

                  {error ? (
                    <div className="mt-2.5 flex items-start gap-2 text-[12px] leading-5 text-red-400">
                      <HugeiconsIcon
                        icon={CancelCircleIcon}
                        size={15}
                        strokeWidth={1.8}
                        className="mt-0.5 shrink-0"
                      />
                      <span>{error}</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px] leading-5 text-zinc-700">
                      This becomes the permanent URL for your workspace.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 border-t border-white/[0.075] pt-6">
                <button
                  type="submit"
                  disabled={
                    loading ||
                    isCheckingSlug ||
                    !!error ||
                    !name.trim() ||
                    !slug
                  }
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {loading ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-zinc-500/40 border-t-zinc-600" />
                      Creating workspace
                    </>
                  ) : (
                    <>
                      Continue to setup
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        size={16}
                        strokeWidth={1.9}
                      />
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-[11px] leading-5 text-zinc-700">
                  By continuing, you agree to the{" "}
                  <Link to="/terms" className="text-zinc-500 hover:text-zinc-300">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-zinc-500 hover:text-zinc-300">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function SlugStatus({
  checking,
  available,
}: {
  checking: boolean;
  available: boolean | null;
}) {
  if (checking) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
        <span className="size-3 animate-spin rounded-full border border-zinc-700 border-t-zinc-400" />
        Checking
      </span>
    );
  }

  if (available === true) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
        <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2} />
        Available
      </span>
    );
  }

  return null;
}

function OnboardingSkeleton() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex h-[76px] w-full max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <div className="h-9 w-28 animate-pulse rounded-xl bg-white/[0.055]" />
          <div className="size-9 animate-pulse rounded-full bg-white/[0.055]" />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.3fr)] lg:gap-20 lg:py-24">
        <div className="space-y-4">
          <div className="size-12 animate-pulse rounded-2xl bg-white/[0.055]" />
          <div className="h-3 w-28 animate-pulse rounded-full bg-white/[0.04]" />
          <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-white/[0.055]" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-white/[0.035]" />
        </div>
        <div className="h-[510px] animate-pulse rounded-[26px] border border-white/[0.075] bg-white/[0.025]" />
      </div>
    </main>
  );
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "OR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
