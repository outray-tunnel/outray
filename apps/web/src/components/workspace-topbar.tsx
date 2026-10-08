import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { MobileNavigationTrigger } from "./mobile-header";
import { WorkspaceAccountMenu } from "./workspace-account-menu";
import { ReportBugModal } from "./report-bug-modal";
import { Sparkles } from "lucide-react";
import { Button } from "./arc/button/button";
import { useAgentChat } from "./agent/agent-chat-context";
import "./outray-arc-theme.css";

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
  const agent = useAgentChat();
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
        <div className="outray-arc ml-auto flex items-center gap-2 sm:gap-3">
          <Button type="button" variant="ghost" size="sm" data-agent-trigger aria-haspopup="dialog" aria-expanded={agent.isOpen} aria-controls={agent.panelId} onClick={agent.openAgent} className={agent.isOpen ? "!bg-white/[0.05] !text-zinc-200" : "!text-zinc-400"}>
            <Sparkles size={14} strokeWidth={1.7} aria-hidden="true" />Agent
          </Button>
          <span aria-hidden="true" className="h-4 w-px bg-white/[0.08]" />
          <WorkspaceAccountMenu
            user={user}
            isPending={isPending}
            onReportBug={() => setReportBugOpen(true)}
            onSignOut={signOut}
          />
        </div>
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
