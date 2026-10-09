import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Cone01Icon from "@hugeicons-pro/core-stroke-rounded/Cone01Icon";
import Key02Icon from "@hugeicons-pro/core-stroke-rounded/Key02Icon";
import LockPasswordIcon from "@hugeicons-pro/core-stroke-rounded/LockPasswordIcon";
import Pulse02Icon from "@hugeicons-pro/core-stroke-rounded/Pulse02Icon";
import HeartPulseIcon from "@hugeicons-pro/core-stroke-rounded/HeartPulseIcon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import Settings02Icon from "@hugeicons-pro/core-stroke-rounded/Settings02Icon";
import UserGroupIcon from "@hugeicons-pro/core-stroke-rounded/UserGroupIcon";
import WalletCardsIcon from "@hugeicons-pro/core-stroke-rounded/WalletCardsIcon";
import Cone01SolidIcon from "@hugeicons-pro/core-solid-rounded/Cone01Icon";
import Key02SolidIcon from "@hugeicons-pro/core-solid-rounded/Key02Icon";
import LockPasswordSolidIcon from "@hugeicons-pro/core-solid-rounded/LockPasswordIcon";
import Pulse02SolidIcon from "@hugeicons-pro/core-solid-rounded/Pulse02Icon";
import HeartPulseSolidIcon from "@hugeicons-pro/core-solid-rounded/HeartPulseIcon";
import Settings02SolidIcon from "@hugeicons-pro/core-solid-rounded/Settings02Icon";
import UserGroupSolidIcon from "@hugeicons-pro/core-solid-rounded/UserGroupIcon";
import WalletCardsSolidIcon from "@hugeicons-pro/core-solid-rounded/WalletCardsIcon";
import { useAppStore } from "@/lib/store";
import { authClient, usePermission } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";
import { NavItem } from "./sidebar/nav-item";
import { OrganizationDropdown } from "./sidebar/organization-dropdown";
import { ProductNavigation } from "./sidebar/product-navigation";
import { filterSidebarProducts } from "./sidebar/product-navigation-state";
import { SidebarCollapseControl } from "./sidebar/sidebar-collapse-control";
import { useInstance } from "@/lib/instance-context";
import { instanceProductForPath } from "../../../../shared/instance-config";

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  unified?: boolean;
}

interface SidebarNavItem {
  to: string;
  label: string;
  icon: IconSvgElement;
  activeIcon: IconSvgElement;
  activeOptions?: { exact: boolean };
}

interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

export function Sidebar({
  isCollapsed,
  setIsCollapsed,
  unified = false,
}: SidebarProps) {
  const sidebarId = useId();
  const instance = useInstance();
  const { setSelectedOrganization } = useAppStore();
  const { data: orgData, isPending: isOrganizationsPending } = authClient.useListOrganizations();
  const organizations = orgData ?? [];
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const location = useLocation();

  const selectedOrg =
    organizations.find((org) => org.slug === orgSlug) || organizations[0];

  const { data: tunnelsData, isError: tunnelsError } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: async () => {
      const response = await appClient.tunnels.list(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug && unified && instance.products.includes("tunnels"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const activeTunnelsCount = tunnelsError
    ? undefined
    : tunnelsData?.tunnels.length;

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const { data: canManageBilling } = usePermission({
    billing: ["manage"],
  });
  const { data: canManageShares } = usePermission({ secretShare: ["create"] });

  const navGroups = useMemo<SidebarNavGroup[]>(
    () => [
      {
        label: "Products",
        items: [
          {
            to: "/$orgSlug/tunnel",
            label: "Tunnels",
            icon: Cone01Icon,
            activeIcon: Cone01SolidIcon,
          },
          {
            to: "/$orgSlug/observability",
            label: "Observability",
            icon: Pulse02Icon,
            activeIcon: Pulse02SolidIcon,
          },
          {
            to: "/$orgSlug/secrets",
            label: "Secrets",
            icon: LockPasswordIcon,
            activeIcon: LockPasswordSolidIcon,
          },
          {
            to: "/$orgSlug/uptime",
            label: "Uptime",
            icon: HeartPulseIcon,
            activeIcon: HeartPulseSolidIcon,
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
            activeIcon: UserGroupSolidIcon,
          },
          {
            to: "/$orgSlug/tokens",
            label: "API tokens",
            icon: Key02Icon,
            activeIcon: Key02SolidIcon,
          },
          ...(canManageBilling && instance.billingEnabled
            ? [
                {
                  to: "/$orgSlug/billing",
                  label: "Billing",
                  icon: WalletCardsIcon,
                  activeIcon: WalletCardsSolidIcon,
                },
              ]
            : []),
          ...(unified
            ? [
                {
                  to: "/$orgSlug/settings",
                  label: "Settings",
                  icon: Settings02Icon,
                  activeIcon: Settings02SolidIcon,
                },
              ]
            : []),
        ],
      },
    ],
    [canManageBilling, unified, instance.billingEnabled],
  );

  const visibleGroups = useMemo(() => {
    const query = navQuery.trim().toLowerCase();
    const allGroups = unified
      ? navGroups.filter((group) => group.label !== "Products")
      : navGroups;
    const groups = allGroups.map((group) => ({ ...group, items: group.items.filter((item) => {
      const product = instanceProductForPath(item.to);
      return !product || instance.products.includes(product);
    }) }));
    if (!query) return groups;

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.label.toLowerCase().includes(query),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, navQuery, unified, instance.products]);

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
  const hasProductResults =
    unified && filterSidebarProducts(navQuery, !!canManageShares, instance.products).length > 0;

  const isNavItemActive = (item: SidebarNavItem) => {
    const targetPath = item.to.replace("/$orgSlug", basePath);
    return (
      location.pathname === targetPath ||
      location.pathname.startsWith(`${targetPath}/`)
    );
  };

  return (
    <aside
      className={`group relative flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#090909] text-zinc-400 transition-[width] duration-200 ease-out motion-reduce:transition-none ${
        isCollapsed ? "w-[68px]" : "w-[248px]"
      }`}
      aria-label="Main navigation"
      id={sidebarId}
      data-sidebar-layout={unified ? "unified" : "split"}
    >
      <div
        className={`flex h-16 shrink-0 items-center ${
          isCollapsed ? "justify-center px-2" : "justify-between px-3"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/logo.png"
            alt="OutRay"
            className="h-8 w-8 shrink-0 object-contain"
          />
          {!isCollapsed && (
            <span className="truncate text-[17px] font-semibold tracking-[-0.03em] text-zinc-100">
              OutRay
            </span>
          )}
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-0.5">
            <button
              ref={searchToggleRef}
              type="button"
              onClick={toggleSearch}
              className={`rounded-lg p-2 transition-colors ${
                isSearchOpen
                  ? "bg-white/[0.07] text-zinc-200"
                  : "text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"
              }`}
              aria-label="Search navigation"
              title="Search navigation"
            >
              <HugeiconsIcon
                icon={Search01Icon}
                size={17}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>

      <OrganizationDropdown
        organizations={organizations}
        setSelectedOrganization={setSelectedOrganization}
        isOrgDropdownOpen={isOrgDropdownOpen}
        setIsOrgDropdownOpen={setIsOrgDropdownOpen}
        isCollapsed={isCollapsed}
        isLoading={isOrganizationsPending}
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
                  searchToggleRef.current?.focus();
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
          {unified && (
            <ProductNavigation
              orgSlug={params.orgSlug}
              pathname={location.pathname}
              isCollapsed={isCollapsed}
              searchQuery={navQuery}
              canManageShares={!!canManageShares}
              activeTunnelsCount={activeTunnelsCount}
            />
          )}
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
                    activeIcon={item.activeIcon}
                    label={item.label}
                    activeOptions={item.activeOptions}
                    isCollapsed={isCollapsed}
                    compact={unified}
                    params={params}
                    isActive={isNavItemActive(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {!isCollapsed && visibleGroups.length === 0 && !hasProductResults && (
          <p className="px-2 py-4 text-[12px] text-zinc-600">
            No pages match “{navQuery}”.
          </p>
        )}
      </nav>

      {!unified && (
        <div
          className={`shrink-0 border-t border-white/[0.06] pt-1 ${
            isCollapsed ? "px-2" : "px-3"
          }`}
        >
          <NavItem
            to="/$orgSlug/settings"
            icon={Settings02Icon}
            activeIcon={Settings02SolidIcon}
            label="Settings"
            isCollapsed={isCollapsed}
            params={params}
            isActive={isNavItemActive({
              to: "/$orgSlug/settings",
              label: "Settings",
              icon: Settings02Icon,
              activeIcon: Settings02SolidIcon,
            })}
          />
        </div>
      )}

      <footer
        data-sidebar-collapse=""
        className="flex shrink-0 items-center justify-start border-t border-white/[0.06] px-4 py-2"
      >
        <SidebarCollapseControl
          isCollapsed={isCollapsed}
          controls={sidebarId}
          onToggle={() => {
            setIsCollapsed(!isCollapsed);
            setIsOrgDropdownOpen(false);
            setIsSearchOpen(false);
            setNavQuery("");
          }}
        />
      </footer>
    </aside>
  );
}
