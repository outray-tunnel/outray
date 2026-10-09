import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { OrganizationSettingsContent, SettingsLoading, SettingsUnavailable } from "@/components/workspace/settings-content";

export const Route = createFileRoute("/$orgSlug/settings/organization")({
  head: () => ({ meta: [{ title: "Organization Settings - OutRay" }] }),
  component: OrganizationSettingsView,
});

function OrganizationSettingsView() {
  const { orgSlug } = Route.useParams();
  const { data: organizations, isPending, error, refetch } = authClient.useListOrganizations();
  const organization = organizations?.find((org) => org.slug === orgSlug);
  if (!organization && isPending) return <SettingsLoading />;
  if (!organization) return <SettingsUnavailable error={Boolean(error)} onRetry={() => { void refetch(); }} />;
  return <OrganizationSettingsContent organization={organization} orgSlug={orgSlug} />;
}
