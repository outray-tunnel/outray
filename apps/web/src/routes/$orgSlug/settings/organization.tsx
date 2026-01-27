import { createFileRoute } from "@tanstack/react-router";
import { Building2, Hash, Type, Database, Shield } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useFeatureFlag } from "@/lib/feature-flags";
import { Card, CardHeader, CardContent, Input, Label } from "@/components/ui";

export const Route = createFileRoute("/$orgSlug/settings/organization")({
  head: () => ({
    meta: [
      { title: "Organization Settings - OutRay" },
    ],
  }),
  component: OrganizationSettingsView,
});

function OrganizationSettingsView() {
  const { orgSlug } = Route.useParams();
  const [fullCaptureEnabled, setFullCaptureEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const { data: organizations } = authClient.useListOrganizations();
  const isFullCaptureFeatureEnabled = useFeatureFlag("full_capture");

  const currentOrg = organizations?.find((org) => org.slug === orgSlug);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(`/api/${orgSlug}/settings`);
        if (response.ok) {
          const data = await response.json();
          setFullCaptureEnabled(data.fullCaptureEnabled);
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setLoading(false);
      }
    };

    if (orgSlug) {
      fetchSettings();
    }
  }, [orgSlug]);

  const handleFullCaptureToggle = async (enabled: boolean) => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/${orgSlug}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fullCaptureEnabled: enabled }),
      });

      if (response.ok) {
        setFullCaptureEnabled(enabled);
        toast.success(
          enabled
            ? "Full request capture enabled"
            : "Full request capture disabled",
        );
      } else {
        throw new Error("Failed to update settings");
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error("Failed to update settings");
    } finally {
      setUpdating(false);
    }
  };

  if (!currentOrg) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Organization */}
      <Card>
        <CardHeader
          icon={<Building2 className="w-5 h-5 text-green-400" />}
          iconBg="bg-green-500/10"
          title="Organization"
          description="Manage your organization settings"
        />
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label>Organization Name</Label>
              <Input
                value={currentOrg.name}
                readOnly
                leftIcon={<Type className="w-4 h-4" />}
                className="cursor-not-allowed opacity-75"
              />
            </div>
            <div>
              <Label>Organization Slug</Label>
              <Input
                value={currentOrg.slug}
                readOnly
                leftIcon={<Hash className="w-4 h-4" />}
                className="cursor-not-allowed opacity-75"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Capture Settings */}
      {isFullCaptureFeatureEnabled && (
        <Card>
          <CardHeader
            icon={<Database className="w-5 h-5 text-blue-400" />}
            iconBg="bg-blue-500/10"
            title="Request Capture"
            description="Configure request and response data capture"
          />
          <CardContent>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-medium text-white">
                    Full Request Capture
                  </h4>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  When enabled, we'll capture and store complete request and
                  response data including headers and body content. This allows
                  for detailed request inspection and replay functionality.
                </p>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs text-amber-300">
                    <strong>Privacy Notice:</strong> Enabling this feature will
                    store request/response bodies which may contain sensitive
                    data. Only enable if you consent to storing this traffic
                    data.
                  </p>
                </div>
              </div>
              <div className="ml-6">
                {loading ? (
                  <div className="w-14 h-7 bg-white/10 rounded-full animate-pulse" />
                ) : (
                  <button
                    onClick={() => handleFullCaptureToggle(!fullCaptureEnabled)}
                    disabled={updating}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                      fullCaptureEnabled
                        ? "border-accent bg-accent/15"
                        : "border-white/20 bg-white/5"
                    } ${updating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full shadow-lg transition-all duration-200 ${
                        fullCaptureEnabled
                          ? "translate-x-8 bg-accent"
                          : "translate-x-1 bg-white/40"
                      }`}
                    />
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
