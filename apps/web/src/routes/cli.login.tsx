import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import CommandLineIcon from "@hugeicons-pro/core-stroke-rounded/CommandLineIcon";
import InformationCircleIcon from "@hugeicons-pro/core-stroke-rounded/InformationCircleIcon";
import LockKeyIcon from "@hugeicons-pro/core-stroke-rounded/LockKeyIcon";
import UserCircleIcon from "@hugeicons-pro/core-stroke-rounded/UserCircleIcon";
import { authClient } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";

export const Route = createFileRoute("/cli/login")({
  head: () => ({
    meta: [
      { title: "CLI Login - OutRay" },
    ],
  }),
  component: CLILogin,
});

function CLILogin() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/cli/login" }) as { code?: string };
  const code = search.code;
  const [status, setStatus] = useState<
    "checking" | "ready" | "authorizing" | "success" | "error"
  >("checking");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<{
    name?: string | null;
    email?: string | null;
  } | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if user is logged in
        const { data: sessionData } = await authClient.getSession();

        if (!sessionData) {
          // Redirect to login with return URL
          navigate({
            to: "/login",
            search: { redirect: `/cli/login?code=${code}` },
          });
          return;
        }

        // User is logged in - check code
        if (!code) {
          setStatus("error");
          setMessage("Invalid login code");
          return;
        }

        setUser({
          name: sessionData.user.name,
          email: sessionData.user.email,
        });
        setStatus("ready");
      } catch (error) {
        console.error("Session check error:", error);
        setStatus("error");
        setMessage("Failed to verify session. Please try again.");
      }
    };

    void checkSession();
  }, [code, navigate]);

  const handleConfirm = async () => {
    if (status !== "ready" || !code) return;

    setStatus("authorizing");

    try {
      const res = await appClient.cli.complete(code);

      if ("error" in res) {
        throw new Error(res.error);
      }

      setStatus("success");
      setMessage("You may close this tab and return to your terminal.");
    } catch (error) {
      console.error("CLI auth error:", error);
      setStatus("error");
      setMessage("Authentication failed. Please try again.");
    }
  };

  const statusContent = {
    checking: {
      title: "Verifying your account",
      description: "Confirming your browser session before continuing.",
    },
    ready: {
      title: "Connect OutRay CLI",
      description:
        "A terminal session is requesting permission to use your OutRay account.",
    },
    authorizing: {
      title: "Connecting your terminal",
      description: "Creating a secure CLI session for your account.",
    },
    success: {
      title: "CLI connected",
      description: message,
    },
    error: {
      title: "Unable to connect",
      description: message,
    },
  }[status];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060606] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "linear-gradient(to bottom, black 0%, transparent 72%)",
        }}
      />

      <header className="relative z-10 flex h-16 items-center border-b border-white/[0.07] px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="OutRay" className="size-6 object-contain" />
          <span className="text-sm font-semibold tracking-[-0.02em] text-zinc-200">
            OutRay
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-700">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Secure authorization
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl lg:grid-cols-[1fr_1px_1fr]">
        <section className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-16">
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-zinc-100 sm:text-5xl">
              Connect your terminal to OutRay.
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-zinc-600">
              Approve this browser request to securely connect the CLI to your
              account and organizations.
            </p>

            <div className="mt-10 border-y border-white/[0.07] py-4 font-mono text-[11px]">
              <div className="flex items-center gap-3 text-zinc-600">
                <span className="select-none text-zinc-800">$</span>
                <span className="text-zinc-400">outray 3000</span>
                <span className="ml-auto flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-zinc-700">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  Waiting
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="hidden bg-white/[0.07] lg:block" />

        <section
          className="flex items-center border-t border-white/[0.07] px-6 py-14 sm:px-12 lg:border-t-0 lg:px-16"
          aria-live="polite"
        >
          <div className="w-full max-w-md">
            {status !== "ready" && (
              <>
                <h2 className="text-2xl font-semibold tracking-[-0.035em] text-zinc-100">
                  {statusContent.title}
                </h2>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  {statusContent.description}
                </p>
              </>
            )}

            {status === "ready" && (
              <>
                <div className="mt-7 border-y border-white/[0.07]">
                  <div className="flex items-center gap-3 py-4">
                    <HugeiconsIcon
                      icon={UserCircleIcon}
                      size={16}
                      strokeWidth={1.7}
                      className="text-zinc-600"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.1em] text-zinc-700">
                        Signed in as
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-400">
                        {user?.email || user?.name || "OutRay user"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-white/[0.07] py-4">
                    <HugeiconsIcon
                      icon={LockKeyIcon}
                      size={16}
                      strokeWidth={1.7}
                      className="mt-0.5 text-zinc-600"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs text-zinc-400">
                        Organization access
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-zinc-700">
                        The CLI can list your organizations and create a tunnel
                        credential for the one you select.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirm}
                  className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-4 text-xs font-semibold text-black transition-colors hover:bg-zinc-200"
                >
                  Authorize CLI
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                </button>
                <div className="mt-4 flex items-start gap-2.5 border-l border-amber-400/35 py-0.5 pl-3 text-[10px] leading-4 text-amber-200/65">
                  <HugeiconsIcon
                    icon={InformationCircleIcon}
                    size={13}
                    strokeWidth={1.7}
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <p>
                    Only continue if you initiated this request from your
                    terminal.
                  </p>
                </div>
              </>
            )}

            {status === "success" && (
              <div className="mt-7 flex items-center gap-3 border-y border-emerald-400/15 py-4 text-xs text-emerald-300/70">
                <HugeiconsIcon
                  icon={CommandLineIcon}
                  size={15}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                Return to your terminal to continue.
              </div>
            )}

            {status === "error" && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-7 h-10 w-full rounded-md border border-white/[0.09] text-xs font-medium text-zinc-400 transition-colors hover:border-white/[0.16] hover:bg-white/[0.03] hover:text-zinc-200"
              >
                Try again
              </button>
            )}

            {(status === "checking" || status === "authorizing") && (
              <div className="mt-7 h-px w-full overflow-hidden bg-white/[0.06]">
                <div className="h-full w-1/3 animate-pulse bg-zinc-500" />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
