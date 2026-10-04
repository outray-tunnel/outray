import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { MobileNavigationTrigger } from "./mobile-header";
import { WorkspaceAccountMenu } from "./workspace-account-menu";
import { ReportBugModal } from "./report-bug-modal";

export function WorkspaceTopbar({
  onOpenNavigation,
  isNavigationOpen,
}: {
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
}) {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const user = session?.user;

  const signOut = async () => {
    const result = await authClient.signOut();
    if (result.error) throw new Error("Could not sign out. Please try again.");
    await navigate({ to: "/", search: { redirect: undefined } });
  };

  return (
    <>
      <header
        aria-label="Workspace top bar"
        className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.07] bg-[#090909] px-3 md:h-11 md:justify-end md:px-8"
      >
        <MobileNavigationTrigger
          onOpenNavigation={onOpenNavigation}
          isNavigationOpen={isNavigationOpen}
        />
        <WorkspaceAccountMenu
          user={user}
          isPending={isPending}
          onReportBug={() => setReportBugOpen(true)}
          onSignOut={signOut}
        />
      </header>
      <ReportBugModal
        isOpen={reportBugOpen}
        onClose={() => setReportBugOpen(false)}
        userEmail={user?.email}
        userName={user?.name}
      />
    </>
  );
}
