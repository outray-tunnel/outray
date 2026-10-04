import { useLocation, useParams } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { mobileProductForPath } from "./mobile-navigation";

export function MobileNavigationTrigger({
  onOpenNavigation,
  isNavigationOpen,
}: {
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
}) {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { pathname } = useLocation();
  const { data: organizations = [] } = authClient.useListOrganizations();

  const selectedOrg =
    organizations?.find((org) => org.slug === orgSlug) || organizations?.[0];
  const section = mobileProductForPath(pathname, orgSlug)?.label ?? "Workspace";

  return (
    <button
      type="button"
      onClick={onOpenNavigation}
      aria-label={`Open navigation for ${selectedOrg?.name || "OutRay"}`}
      aria-expanded={isNavigationOpen}
      aria-controls="mobile-workspace-navigation"
      className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-2 text-left md:hidden focus-visible:outline-2 focus-visible:outline-violet-400"
    >
      <img src="/logo.png" alt="" className="size-7 shrink-0 object-contain" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-5 text-zinc-100">
          {selectedOrg?.name || "OutRay"}
        </span>
        <span className="block text-[11px] leading-4 text-zinc-500">
          {section}
        </span>
      </span>
      <ChevronDown
        size={15}
        className="shrink-0 text-zinc-500"
        aria-hidden="true"
      />
    </button>
  );
}
