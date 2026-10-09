import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { RequestsExplorer } from "@/components/requests/requests-explorer";

interface TunnelRequestsProps {
  tunnelId: string;
}

export function TunnelRequests({ tunnelId }: TunnelRequestsProps) {
  const { orgSlug } = useParams({ from: "/$orgSlug/tunnel/tunnels/$tunnelId" });
  const { data: organizations = [] } = authClient.useListOrganizations();
  const activeOrgId = organizations?.find((org) => org.slug === orgSlug)?.id;
  const inspectorEnabled = useFeatureFlag("request_inspector");
  const fullCaptureFeatureEnabled = useFeatureFlag("full_capture");

  const { data: orgSettings } = useQuery({
    queryKey: ["org-settings", orgSlug],
    queryFn: async () => {
      const response = await appClient.settings.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  return (
    <RequestsExplorer
      orgSlug={orgSlug}
      orgId={activeOrgId}
      tunnelId={tunnelId}
      inspectorEnabled={inspectorEnabled}
      fullCaptureEnabled={
        fullCaptureFeatureEnabled && (orgSettings?.fullCaptureEnabled ?? false)
      }
    />
  );
}
