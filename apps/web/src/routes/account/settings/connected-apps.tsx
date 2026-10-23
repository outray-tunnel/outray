import { createFileRoute } from "@tanstack/react-router";
import { ConnectedAppsSettings } from "@/components/mcp/connected-apps-settings";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/account/settings/connected-apps")({
  head: () => ({ meta: [{ title: "Connected apps - OutRay" }] }),
  component: () => <div className="space-y-6"><WorkspacePageHeader appearance="compact" title="Connected apps" description="Manage apps connected to your personal account and the organizations they can access." /><ConnectedAppsSettings /></div>,
});
