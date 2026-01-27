import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Loader2, CheckCircle, XCircle, Terminal } from "lucide-react";
import { appClient } from "@/lib/app-client";
import { Button } from "@/components/ui";

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
    "loading" | "ready" | "success" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<any>(null);

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

        setSession(sessionData);
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
    if (!session || !code) return;

    setStatus("loading");

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            {status === "loading" && (
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            )}
            {status === "ready" && (
              <Terminal className="h-8 w-8 text-blue-400" />
            )}
            {status === "success" && (
              <CheckCircle className="h-8 w-8 text-green-400" />
            )}
            {status === "error" && <XCircle className="h-8 w-8 text-red-400" />}
          </div>

          <h2 className="text-2xl font-bold tracking-tight">
            {status === "loading" && "Verifying..."}
            {status === "ready" && "Authorize CLI Login"}
            {status === "success" && "Successfully Authenticated"}
            {status === "error" && "Authentication Failed"}
          </h2>

          <p className="mt-2 text-sm text-gray-400">
            {status === "loading" && "Please wait while we verify your session"}
            {status === "ready" &&
              "A CLI session is requesting access to your account."}
            {status === "success" && message}
            {status === "error" && message}
          </p>

          {status === "ready" && (
            <Button
              onClick={handleConfirm}
              className="mt-8 w-full"
            >
              Confirm Login
            </Button>
          )}

          {status === "success" && (
            <div className="mt-8 flex items-center gap-2 rounded-lg bg-black/50 px-4 py-3 text-sm text-gray-400 border border-white/10">
              <Terminal className="h-4 w-4" />
              <span>Return to your terminal to continue</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
