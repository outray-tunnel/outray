import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/invitations/accept")({
  head: () => ({
    meta: [
      { title: "Accept Invitation - OutRay" },
    ],
  }),
  component: AcceptInvitation,
  validateSearch: (search: Record<string, unknown>): { token: string } => {
    return {
      token: search.token as string,
    };
  },
});

function AcceptInvitation() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"processing" | "success" | "error">(
    "processing",
  );
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();

  useEffect(() => {
    if (isSessionPending) return;

    if (!session) {
      navigate({
        to: "/login",
        search: {
          redirect: `/invitations/accept?token=${token}`,
        },
      });
      return;
    }

    if (!token) {
      setError("No invitation token provided");
      setStatus("error");
      return;
    }

    const accept = async () => {
      try {
        const { data, error } = await authClient.organization.acceptInvitation({
          invitationId: token,
        });

        if (error) {
          setError(error.message || "An unknown error occurred");
          setStatus("error");
        } else {
          setStatus("success");
          // Redirect to dashboard after short delay
          setTimeout(() => {
            navigate({
              to: "/$orgSlug",
              params: { orgSlug: "select" },
            });
          }, 2000);
        }
      } catch (e) {
        setError("Failed to accept invitation");
        setStatus("error");
      }
    };

    accept();
  }, [token, navigate, session, isSessionPending]);

  if (status === "processing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707] text-gray-300">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
          <h1 className="text-2xl font-bold text-white mb-2">
            Accepting Invitation...
          </h1>
          <p className="text-gray-500">
            Please wait while we process your invitation.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070707] text-gray-300">
        <div className="text-center max-w-md mx-auto p-8 bg-white/2 border border-white/5 rounded-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <span className="text-3xl">✕</span>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-white">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <Button
            onClick={() => navigate({ to: "/" })}
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070707] text-gray-300">
      <div className="text-center max-w-md mx-auto p-8 bg-white/2 border border-white/5 rounded-2xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="text-2xl font-bold mb-2 text-white">
          Invitation Accepted!
        </h1>
        <p className="text-gray-400 mb-2">
          You have successfully joined the organization.
        </p>
        <p className="text-sm text-gray-600">Redirecting to dashboard...</p>
      </div>
    </div>
  );
}
