import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import InformationCircleIcon from "@outray/icons/stroke/InformationCircleIcon";
import Settings02Icon from "@outray/icons/stroke/Settings02Icon";
import { toast } from "sonner";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogTrigger } from "@/components/arc/dialog/dialog";
import { RequestsExplorer } from "@/components/requests/requests-explorer";
import { RequestCaptureSettingsModal } from "@/components/requests/request-capture-settings";
import "@/components/outray-arc-theme.css";

export const Route = createFileRoute("/$orgSlug/tunnel/requests")({
  head: () => ({
    meta: [{ title: "Requests - OutRay" }],
  }),
  component: RequestsView,
});

function RequestsView() {
  const { orgSlug } = Route.useParams();
  return <OrganizationRequestsView key={orgSlug} orgSlug={orgSlug} />;
}

function OrganizationRequestsView({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const [isCaptureSettingsOpen, setIsCaptureSettingsOpen] = useState(false);
  const [captureSettingsSession, setCaptureSettingsSession] = useState(0);
  const isMounted = useRef(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const { data: organizations = [] } = authClient.useListOrganizations();
  const activeOrgId = organizations?.find((org) => org.slug === orgSlug)?.id;
  const inspectorEnabled = useFeatureFlag("request_inspector");
  const fullCaptureFeatureEnabled = useFeatureFlag("full_capture");

  const {
    data: orgSettings,
    isLoading: isLoadingOrgSettings,
    isError: isOrgSettingsError,
    isFetching: isFetchingOrgSettings,
    refetch: refetchOrgSettings,
  } = useQuery({
    queryKey: ["org-settings", orgSlug],
    queryFn: async () => {
      const response = await appClient.settings.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  const captureSettingEnabled = orgSettings?.fullCaptureEnabled ?? false;
  const fullCaptureEnabled = fullCaptureFeatureEnabled && captureSettingEnabled;

  const updateFullCaptureMutation = useMutation({
    mutationFn: async ({
      enabled,
      targetOrgSlug,
    }: {
      enabled: boolean;
      targetOrgSlug: string;
    }) => {
      const response = await appClient.settings.update(targetOrgSlug, {
        fullCaptureEnabled: enabled,
      });
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    onSuccess: (response, { targetOrgSlug }) => {
      queryClient.setQueryData(["org-settings", targetOrgSlug], {
        fullCaptureEnabled: response.fullCaptureEnabled,
      });
      if (!isMounted.current) return;
      toast.success("Capture settings saved");
    },
  });

  const saveCaptureSettings = async (enabled: boolean) => {
    if (
      saveInFlight.current ||
      updateFullCaptureMutation.isPending ||
      !orgSettings ||
      enabled === captureSettingEnabled
    ) {
      return;
    }
    saveInFlight.current = true;
    try {
      await updateFullCaptureMutation.mutateAsync({
        enabled,
        targetOrgSlug: orgSlug,
      });
      if (isMounted.current) setIsCaptureSettingsOpen(false);
    } finally {
      saveInFlight.current = false;
    }
  };

  return (
    <Dialog
      open={fullCaptureFeatureEnabled && isCaptureSettingsOpen}
      onOpenChange={(open) => {
        if (saveInFlight.current || updateFullCaptureMutation.isPending) return;
        setIsCaptureSettingsOpen(open);
        if (open && !updateFullCaptureMutation.isPending) {
          setCaptureSettingsSession((session) => session + 1);
          updateFullCaptureMutation.reset();
        }
      }}
    >
      <div className="outray-arc mx-auto max-w-[1440px] space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
          <div className="min-w-0">
            <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">
              Requests
            </h1>
            <p className="mt-1 text-[12px] text-zinc-400">
              Inspect live and historical traffic across your HTTP tunnels.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[11px] text-zinc-400">
              <HugeiconsIcon
                icon={InformationCircleIcon}
                size={14}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              {isLoadingOrgSettings
                ? "Loading capture settings"
                : isOrgSettingsError
                  ? "Capture settings unavailable"
                  : fullCaptureEnabled
                    ? "Full capture on"
                    : "Metadata only"}
            </span>
            {fullCaptureFeatureEnabled && (
              <DialogTrigger asChild>
                <Button type="button" variant="secondary" size="md">
                  <HugeiconsIcon
                    icon={Settings02Icon}
                    size={14}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  Capture settings
                </Button>
              </DialogTrigger>
            )}
          </div>
        </header>

        <RequestsExplorer
          orgSlug={orgSlug}
          orgId={activeOrgId}
          inspectorEnabled={inspectorEnabled}
          fullCaptureEnabled={fullCaptureEnabled}
        />
      </div>

      {fullCaptureFeatureEnabled && (
        <RequestCaptureSettingsModal
          key={captureSettingsSession}
          enabled={captureSettingEnabled}
          isLoading={isLoadingOrgSettings}
          isLoadError={isOrgSettingsError && !orgSettings}
          isRetrying={isFetchingOrgSettings}
          isUpdating={updateFullCaptureMutation.isPending}
          updateError={updateFullCaptureMutation.error?.message}
          onRetry={() => void refetchOrgSettings()}
          onSave={saveCaptureSettings}
          onCancel={() => {
            if (!saveInFlight.current && !updateFullCaptureMutation.isPending) {
              setIsCaptureSettingsOpen(false);
            }
          }}
        />
      )}
    </Dialog>
  );
}
