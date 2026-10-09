import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Building2, UserRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { WorkspacePageHeader } from "@/components/workspace-page-header";
import "@/components/outray-arc-theme.css";

export const Route = createFileRoute("/$orgSlug/settings")({
  head: () => ({ meta: [{ title: "Settings - OutRay" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { orgSlug } = Route.useParams();
  const navigate = Route.useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const tab = pathname.endsWith("/organization") ? "organization" : "profile";

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="Settings" description="Your account and workspace identity." />
    <Tabs value={tab} className="outray-arc-tunnel-tabs" onValueChange={(value) => {
      void navigate({ to: value === "organization" ? "/$orgSlug/settings/organization" : "/$orgSlug/settings/profile", params: { orgSlug } });
    }}>
      <TabsList data-outray-tabs-list aria-label="Settings sections">
        <TabsTrigger data-outray-tabs-trigger value="profile"><span className="inline-flex items-center gap-2"><UserRound size={14} aria-hidden="true" />Profile</span></TabsTrigger>
        <TabsTrigger data-outray-tabs-trigger value="organization"><span className="inline-flex items-center gap-2"><Building2 size={14} aria-hidden="true" />Organization</span></TabsTrigger>
      </TabsList>
      <TabsContent value={tab} forceMount><Outlet /></TabsContent>
    </Tabs>
  </div>;
}
