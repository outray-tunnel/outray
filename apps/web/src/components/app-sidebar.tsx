import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import Search01Icon from "@outray/icons/stroke/Search01Icon";
import Settings02Icon from "@outray/icons/stroke/Settings02Icon";
import Cone01SolidIcon from "@outray/icons/solid/Cone01Icon";
import LockPasswordSolidIcon from "@outray/icons/solid/LockPasswordIcon";
import Pulse02SolidIcon from "@outray/icons/solid/Pulse02Icon";
import HeartPulseSolidIcon from "@outray/icons/solid/HeartPulseIcon";
import Settings02SolidIcon from "@outray/icons/solid/Settings02Icon";
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
import { SidebarSettingsNavigation } from "./workspace/settings-navigation";

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  unified?: boolean;
  orgSlug?: string;
  mode?: "dashboard" | "organization" | "personal";
  backHref?: string;
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
  orgSlug: providedOrgSlug,
  mode = "dashboard",
  backHref = "/select",
}: SidebarProps) {
  const sidebarId = useId();
  const instance = useInstance();
  const { setSelectedOrganization } = useAppStore();
  const { data: orgData, isPending: isOrganizationsPending } = authClient.useListOrganizations();
  const organizations = orgData ?? [];
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [search, setSearch] = useState({ mode, query: "" });
  const navQuery = search.mode === mode ? search.query : "";
  const setNavQuery = (query: string) => setSearch({ mode, query });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const routeParams = useParams({ strict: false });
  const orgSlug = providedOrgSlug ?? routeParams.orgSlug ?? "";
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  const selectedOrg =
    organizations.find((org) => org.slug === orgSlug) || organizations[0];

  const { data: tunnelsData, isError: tunnelsError } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: async () => {
      const response = await appClient.tunnels.list(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: mode === "dashboard" && !!orgSlug && unified && instance.products.includes("tunnels"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const activeTunnelsCount = tunnelsError
    ? undefined
    : tunnelsData?.tunnels.length;

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const { data: canManageShares } = usePermission({ secretShare: ["create"] });
  const { data: canManageBilling } = usePermission({ billing: ["manage"] });

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
            to: "/$orgSlug/secrets/vaults",
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
    [unified],
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
    const targetPath = (item.to === "/$orgSlug/secrets/vaults" ? "/$orgSlug/secrets" : item.to).replace("/$orgSlug", basePath);
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
      data-sidebar-mode={mode}
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
        orgSlug={orgSlug}
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
        className={`scrollbar-hide min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-3 pt-3 ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        <AnimatePresence initial={false} mode="wait">
          <SidebarNavigationPanel key={mode} reducedMotion={Boolean(reducedMotion)}>
            {mode === "dashboard" ? (
              <>
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
                {!unified && (
                  <div
                    className={`mt-auto shrink-0 border-t border-white/[0.06] pt-1 ${
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
              </>
            ) : (
              <SidebarSettingsNavigation mode={mode} orgSlug={orgSlug} backHref={backHref} isCollapsed={isCollapsed} billing={Boolean(canManageBilling && instance.billingEnabled)} query={navQuery} />
            )}
          </SidebarNavigationPanel>
        </AnimatePresence>
      </nav>

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

function SidebarNavigationPanel({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean }) {
  const present = useIsPresent();
  return <motion.div className="flex min-h-full flex-col" inert={!present} aria-hidden={present ? undefined : true}
    initial={reducedMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reducedMotion ? 0 : -8 }}
    transition={{ duration: reducedMotion ? 0 : present ? .16 : .08, ease: [.22, 1, .36, 1] }}>
    {children}
  </motion.div>;
}
