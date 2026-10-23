import { Navigate, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { workspaceScopeClassName } from "@/components/ui/workspace-scope";
import { WorkspaceAccountMenu } from "@/components/workspace-account-menu";
import { ReportBugModal } from "@/components/report-bug-modal";
import { SettingsNavigationDisclosure } from "./settings-navigation";
import { personalSettingsItems } from "./settings-navigation-state";

export function AccountSettingsLayout() {
  const { data: session, isPending } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const user = session?.user;
  if (!user && isPending) return <div role="status" className="grid min-h-svh place-items-center bg-[#090909] text-sm text-zinc-400">Loading your account…</div>;
  if (!user) return <Navigate to="/login" search={{ redirect: pathname }} replace />;
  const organization = organizations?.find((org) => org.id === activeOrganization?.id) ?? organizations?.[0];
  const backHref = organization ? `/${encodeURIComponent(organization.slug)}` : "/select";
  const signOut = async () => {
    const result = await authClient.signOut();
    if (result.error) throw new Error("Could not sign out. Please try again.");
    await navigate({ to: "/", search: { redirect: undefined } });
  };
  return <div className={`${workspaceScopeClassName} flex h-full min-h-0 w-full overflow-hidden bg-[#090909] font-sans text-zinc-300 selection:bg-accent/30`}>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[.07] px-4 md:h-11 md:px-8"><p className="text-xs text-zinc-500">Personal settings</p><WorkspaceAccountMenu user={user} onAccountSettings={() => { void navigate({ to: "/account/settings" }); }} onReportBug={() => setReportBugOpen(true)} onSignOut={signOut} /></header>
      <SettingsNavigationDisclosure items={personalSettingsItems} label="Personal settings" backHref={backHref} />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-6 md:px-12 md:py-8"><div className="mx-auto w-full max-w-[960px]"><Outlet /></div></main>
    </div>
    <ReportBugModal isOpen={reportBugOpen} onClose={() => setReportBugOpen(false)} userEmail={user.email} userName={user.name} />
  </div>;
}
