import { createFileRoute } from "@tanstack/react-router";
import { authClient, usePermission } from "@/lib/auth-client";
import { OrganizationSettingsContent, SettingsLoading, SettingsUnavailable } from "@/components/workspace/settings-content";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/$orgSlug/settings/organization")({
  head: () => ({ meta: [{ title: "Organization Settings - OutRay" }] }),
  component: OrganizationSettingsView,
});

function OrganizationSettingsView() {
  const { orgSlug } = Route.useParams();
  const { data: organizations, isPending, error, refetch } = authClient.useListOrganizations();
  const { data: activeOrganization, refetch: refetchActiveOrganization } = authClient.useActiveOrganization();
  const { data: canUpdateOrganization } = usePermission({ organization: ["update"] });
  const organization = organizations?.find((org) => org.slug === orgSlug);
  if (!organization && isPending) return <SettingsLoading />;
  if (!organization) return <SettingsUnavailable error={Boolean(error)} onRetry={() => { void refetch(); }} />;
  return <div className="space-y-6"><WorkspacePageHeader appearance="compact" title="General" description={`Manage ${organization.name}’s organization identity.`} /><OrganizationSettingsContent key={organization.id} organization={organization} orgSlug={orgSlug} appearance="stacked"
    canUploadLogo={activeOrganization?.id === organization.id && canUpdateOrganization}
    onLogoUpdated={() => { void refetch(); void refetchActiveOrganization(); }} /></div>;
}
