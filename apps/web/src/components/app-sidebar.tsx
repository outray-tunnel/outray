import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CreditCardIcon,
  Key01Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Pulse02Icon,
  Route03Icon,
  Search01Icon,
  SecurityLockIcon,
  Settings02Icon,
  UserGroupIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import { useAppStore } from "@/lib/store";
import { authClient, usePermission } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";
import { getPlanLimits } from "@/lib/subscription-plans";
import { NavItem } from "./sidebar/nav-item";
import { OrganizationDropdown } from "./sidebar/organization-dropdown";
import { PlanUsage } from "./sidebar/plan-usage";
import { UserSection } from "./sidebar/user-section";

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

interface SidebarNavItem {
  to: string;
  label: string;
  icon: IconSvgElement;
  activeOptions?: { exact: boolean };
}

interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const { setSelectedOrganization } = useAppStore();
  const { data: organizations = [] } = authClient.useListOrganizations();
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [activeTunnelsCount, setActiveTunnelsCount] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const location = useLocation();

  const selectedOrg =
    organizations.find((org) => org.slug === orgSlug) || organizations[0];

  const { data: session } = authClient.useSession();
  const user = session?.user;

  const { data: subscriptionData } = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      if (!orgSlug) return null;
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug,
  });

  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);
  const tunnelLimit = planLimits.maxTunnels;

  useEffect(() => {
    const fetchStats = async () => {
      if (!orgSlug) return;
      const response = await appClient.stats.overview(orgSlug);
      if (response && "activeTunnels" in response) {
        setActiveTunnelsCount(response.activeTunnels || 0);
      }
    };
    fetchStats();
  }, [orgSlug]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const { data: canManageBilling } = usePermission({
    billing: ["manage"],
  });

  const navGroups = useMemo<SidebarNavGroup[]>(
    () => [
      {
        label: "Products",
        items: [
          {
            to: "/$orgSlug",
            label: "Tunnels",
            icon: Route03Icon,
          },
          {
            to: "/$orgSlug/observability",
            label: "Observability",
            icon: Pulse02Icon,
          },
          {
            to: "/$orgSlug/secrets",
            label: "Secrets",
            icon: SecurityLockIcon,
          },
        ],
      },
      {
        label: "Workspace",
        items: [
          {
            to: "/$orgSlug/members",
            label: "Members",
            icon: UserGroupIcon,
          },
          {
            to: "/$orgSlug/tokens",
            label: "API tokens",
            icon: Key01Icon,
          },
          ...(canManageBilling
            ? [
                {
                  to: "/$orgSlug/billing",
                  label: "Billing",
                  icon: CreditCardIcon,
                },
              ]
            : []),
        ],
      },
    ],
    [canManageBilling],
  );

  const visibleGroups = useMemo(() => {
    const query = navQuery.trim().toLowerCase();
    if (!query) return navGroups;

    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, navQuery]);

  const toggleSearch = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setIsSearchOpen(true);
      return;
    }
    setIsSearchOpen((open) => !open);
    if (isSearchOpen) setNavQuery("");
  };

  const params = { orgSlug: selectedOrg?.slug ?? orgSlug ?? "" };
  const basePath = `/${params.orgSlug}`;

  const isNavItemActive = (item: SidebarNavItem) => {
    if (item.to === "/$orgSlug") {
      const tunnelPaths = [
        basePath,
        `${basePath}/tunnels`,
        `${basePath}/requests`,
        `${basePath}/subdomains`,
        `${basePath}/domains`,
        `${basePath}/install`,
      ];

      return tunnelPaths.some((path) =>
        path === basePath
          ? location.pathname === path
          : location.pathname === path ||
            location.pathname.startsWith(`${path}/`),
      );
    }

    const targetPath = item.to.replace("/$orgSlug", basePath);
    return (
      location.pathname === targetPath ||
      location.pathname.startsWith(`${targetPath}/`)
    );
  };

  return (
    <aside
      className={`group relative flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#090909] text-zinc-400 transition-[width] duration-200 ease-out ${
        isCollapsed ? "w-[64px]" : "w-[232px]"
      }`}
      aria-label="Main navigation"
    >
      <div
        className={`flex h-14 shrink-0 items-center ${
          isCollapsed ? "justify-center px-2" : "justify-between px-3"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/logo.png"
            alt="OutRay"
            className="h-7 w-7 shrink-0 object-contain"
          />
          {!isCollapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.03em] text-zinc-100">
              OutRay
            </span>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={toggleSearch}
              className={`rounded-md p-1.5 transition-colors ${
                isSearchOpen
                  ? "bg-white/[0.07] text-zinc-200"
                  : "text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"
              }`}
              aria-label="Search navigation"
              title="Search navigation"
            >
              <HugeiconsIcon
                icon={Search01Icon}
                size={15}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <HugeiconsIcon
                icon={PanelLeftCloseIcon}
                size={15}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </button>
          </div>
        )}

        {isCollapsed && (
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="absolute left-[39px] top-5 rounded bg-[#151515] p-1 text-zinc-500 opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity hover:text-zinc-200 group-hover:opacity-100"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <HugeiconsIcon
              icon={PanelLeftOpenIcon}
              size={13}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <OrganizationDropdown
        organizations={organizations}
        setSelectedOrganization={setSelectedOrganization}
        isOrgDropdownOpen={isOrgDropdownOpen}
        setIsOrgDropdownOpen={setIsOrgDropdownOpen}
        isCollapsed={isCollapsed}
      />

      {!isCollapsed && isSearchOpen && (
        <div className="px-3 pb-1 pt-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 text-zinc-500 focus-within:border-white/[0.14] focus-within:text-zinc-300">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              value={navQuery}
              onChange={(event) => setNavQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNavQuery("");
                  setIsSearchOpen(false);
                }
              }}
              placeholder="Find a page"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-zinc-200 outline-none placeholder:text-zinc-700"
              aria-label="Search navigation"
            />
          </div>
        </div>
      )}

      <nav
        className={`scrollbar-hide flex-1 overflow-x-hidden overflow-y-auto pb-3 pt-3 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <div className="space-y-5">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.label || `primary-${groupIndex}`}>
              {!isCollapsed && group.label && (
                <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.11em] text-zinc-700">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={item.label}
                    activeOptions={item.activeOptions}
                    isCollapsed={isCollapsed}
                    params={params}
                    isActive={isNavItemActive(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {!isCollapsed && visibleGroups.length === 0 && (
          <p className="px-2 py-4 text-[12px] text-zinc-600">
            No pages match “{navQuery}”.
          </p>
        )}
      </nav>

      <div
        className={`shrink-0 border-t border-white/[0.06] pt-1 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <NavItem
          to="/$orgSlug/settings"
          icon={Settings02Icon}
          label="Settings"
          isCollapsed={isCollapsed}
          params={params}
          isActive={isNavItemActive({
            to: "/$orgSlug/settings",
            label: "Settings",
            icon: Settings02Icon,
          })}
        />
      </div>

      {!isCollapsed && (
        <div className="mx-3 mt-1 border-t border-white/[0.06] pt-1">
          <PlanUsage
            activeTunnelsCount={activeTunnelsCount}
            limit={tunnelLimit}
            currentPlan={currentPlan}
          />
        </div>
      )}

      <UserSection user={user} isCollapsed={isCollapsed} />
    </aside>
  );
}
