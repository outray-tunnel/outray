import { useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IconSvgElement } from "@hugeicons/react";
import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import Alert02Icon from "@outray/icons/stroke/Alert02Icon";
import Audit01Icon from "@outray/icons/stroke/Audit01Icon";
import Folder01Icon from "@outray/icons/stroke/Folder01Icon";
import Globe02Icon from "@outray/icons/stroke/Globe02Icon";
import HistoryIcon from "@outray/icons/stroke/HistoryIcon";
import Home01Icon from "@outray/icons/stroke/Home01Icon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import LinkSquare01Icon from "@outray/icons/stroke/LinkSquare01Icon";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import LogsIcon from "@outray/icons/stroke/LogsIcon";
import Notification02Icon from "@outray/icons/stroke/Notification02Icon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";
import ServerStack01Icon from "@outray/icons/stroke/ServerStack01Icon";
import WorkflowSquare06Icon from "@outray/icons/stroke/WorkflowSquare06Icon";
import { NavItem } from "./sidebar/nav-item";
import { usePermission } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";
import { ActiveTunnelBadge } from "./sidebar/active-tunnel-badge";

interface SubNavItem {
  label: string;
  to: string;
  icon: IconSvgElement;
  exact?: boolean;
}

interface ProductNavigation {
  name: string;
  items: SubNavItem[];
}

export function ProductSubSidebar() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { data: canManageShares } = usePermission({ secretShare: ["create"] });
  const location = useLocation();
  const basePath = `/${orgSlug}`;

  const tunnelPath = `${basePath}/tunnel`;
  const isTunnelRoute = location.pathname === tunnelPath || location.pathname.startsWith(`${tunnelPath}/`);

  const { data: tunnelsData, isError: tunnelsError } = useQuery({
    queryKey: ["tunnels", orgSlug],
    queryFn: async () => {
      const response = await appClient.tunnels.list(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!orgSlug && isTunnelRoute,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const activeTunnelsCount = tunnelsError
    ? undefined
    : tunnelsData?.tunnels.length;

  let product: ProductNavigation | null = null;

  if (isTunnelRoute) {
    product = {
      name: "Tunnels",
      items: [
        { label: "Overview", to: "/$orgSlug/tunnel", icon: Home01Icon, exact: true },
        {
          label: "Active tunnels",
          to: "/$orgSlug/tunnel/tunnels",
          icon: Route03Icon,
        },
        {
          label: "Requests",
          to: "/$orgSlug/tunnel/requests",
          icon: HistoryIcon,
        },
        {
          label: "Subdomains",
          to: "/$orgSlug/tunnel/subdomains",
          icon: Globe02Icon,
        },
        {
          label: "Domains",
          to: "/$orgSlug/tunnel/domains",
          icon: LinkSquare01Icon,
        },
      ],
    };
  } else if (location.pathname.startsWith(`${basePath}/observability`)) {
    product = {
      name: "Observability",
      items: [
        {
          label: "Overview",
          to: "/$orgSlug/observability",
          icon: Home01Icon,
          exact: true,
        },
        {
          label: "Services",
          to: "/$orgSlug/observability/services",
          icon: ServerStack01Icon,
        },
        {
          label: "Requests",
          to: "/$orgSlug/observability/requests",
          icon: Route03Icon,
        },
        {
          label: "Metrics",
          to: "/$orgSlug/observability/metrics",
          icon: Activity03Icon,
        },
        {
          label: "Logs",
          to: "/$orgSlug/observability/logs",
          icon: LogsIcon,
        },
        {
          label: "Traces",
          to: "/$orgSlug/observability/traces",
          icon: WorkflowSquare06Icon,
        },
        {
          label: "Alerts",
          to: "/$orgSlug/observability/alerts",
          icon: Alert02Icon,
        },
      ],
    };
  } else if (location.pathname.startsWith(`${basePath}/secrets`)) {
    product = {
      name: "Secrets",
      items: [
        {
          label: "Overview",
          to: "/$orgSlug/secrets",
          icon: Home01Icon,
          exact: true,
        },
        {
          label: "Vaults",
          to: "/$orgSlug/secrets/vaults",
          icon: Folder01Icon,
        },
        ...(canManageShares ? [{ label: "Shares", to: "/$orgSlug/secrets/shares", icon: LinkSquare01Icon }] : []),
        { label: "Trash", to: "/$orgSlug/secrets/trash", icon: Delete02Icon },
        {
          label: "Audit log",
          to: "/$orgSlug/secrets/audit",
          icon: Audit01Icon,
        },
      ],
    };
  } else if (location.pathname.startsWith(`${basePath}/uptime`)) {
    product = {
      name: "Uptime",
      items: [
        { label: "Overview", to: "/$orgSlug/uptime", icon: Home01Icon, exact: true },
        { label: "Monitors", to: "/$orgSlug/uptime/monitors", icon: HeartPulseIcon },
        { label: "Incidents", to: "/$orgSlug/uptime/incidents", icon: Alert02Icon },
        { label: "Notifications", to: "/$orgSlug/uptime/notifications", icon: Notification02Icon },
        { label: "Status page", to: "/$orgSlug/uptime/status-page", icon: Globe02Icon },
      ],
    };
  }

  if (!product) return null;

  const isItemActive = (item: SubNavItem) => {
    const target = item.to.replace("/$orgSlug", basePath);
    if (item.exact) return location.pathname === target;
    return (
      location.pathname === target || location.pathname.startsWith(`${target}/`)
    );
  };

  return (
    <aside
      className="flex h-full w-[228px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0c0c0c] px-3.5"
      aria-label={`${product.name} navigation`}
    >
      <div className="px-2.5 pt-6">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-zinc-100">
          {product.name}
        </h2>
      </div>

      <nav className="flex-1 pb-4 pt-4">
        <div className="space-y-0.5">
          {product.items.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              isCollapsed={false}
              params={{ orgSlug }}
              isActive={isItemActive(item)}
              badge={
                item.to === "/$orgSlug/tunnel/tunnels" ? (
                  <ActiveTunnelBadge count={activeTunnelsCount} />
                ) : undefined
              }
            />
          ))}
        </div>
      </nav>
    </aside>
  );
}
