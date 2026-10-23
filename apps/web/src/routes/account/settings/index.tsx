import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { ProfileSettingsContent, SettingsLoading, SettingsUnavailable } from "@/components/workspace/settings-content";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/account/settings/")({
  head: () => ({ meta: [{ title: "Personal settings - OutRay" }] }),
  component: PersonalGeneralSettings,
});

function PersonalGeneralSettings() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  if (!session?.user && isPending) return <SettingsLoading />;
  if (!session?.user) return <SettingsUnavailable error={Boolean(error)} onRetry={() => { void refetch(); }} />;
  return <div className="space-y-6"><WorkspacePageHeader appearance="compact" title="General" description="Your personal profile across OutRay workspaces." /><ProfileSettingsContent user={session.user} appearance="stacked" /></div>;
}
