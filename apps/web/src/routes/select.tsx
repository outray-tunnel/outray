import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/select")({
  head: () => ({
    meta: [
      { title: "Select Organization - OutRay" },
    ],
  }),
  component: SelectOrganization,
});

function SelectOrganization() {
  const { data: organizations, isPending } = authClient.useListOrganizations();

  if (isPending) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!organizations?.length) {
    return <Navigate to="/onboarding" />;
  }

  return (
    <div className="min-h-screen bg-[#070707] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src="/logo.png" alt="OutRay Logo" className="w-10" />
            <span className="font-bold text-white text-xl tracking-tight">
              OutRay
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Select Organization
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Choose an organization to continue to your dashboard.
          </p>
        </div>

        <div className="space-y-3">
          {organizations.map((org) => (
            <Link
              key={org.id}
              to="/$orgSlug"
              params={{ orgSlug: org.slug }}
              className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-colors">
                  <span className="text-sm font-bold text-white">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left">
                  <h3 className="font-medium text-white group-hover:text-white transition-colors">
                    {org.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">{org.slug}</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/onboarding"
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            Create a new organization
          </Link>
        </div>
      </div>
    </div>
  );
}
