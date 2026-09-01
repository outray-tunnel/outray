import { useLocation, useParams } from "@tanstack/react-router";
import type { IconSvgElement } from "@hugeicons/react";
import Activity03Icon from "@hugeicons-pro/core-stroke-rounded/Activity03Icon";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import Audit01Icon from "@hugeicons-pro/core-stroke-rounded/Audit01Icon";
import Folder01Icon from "@hugeicons-pro/core-stroke-rounded/Folder01Icon";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
import HistoryIcon from "@hugeicons-pro/core-stroke-rounded/HistoryIcon";
import Home01Icon from "@hugeicons-pro/core-stroke-rounded/Home01Icon";
import LinkSquare01Icon from "@hugeicons-pro/core-stroke-rounded/LinkSquare01Icon";
import LogsIcon from "@hugeicons-pro/core-stroke-rounded/LogsIcon";
import Route03Icon from "@hugeicons-pro/core-stroke-rounded/Route03Icon";
import ServerStack01Icon from "@hugeicons-pro/core-stroke-rounded/ServerStack01Icon";
import WorkflowSquare06Icon from "@hugeicons-pro/core-stroke-rounded/WorkflowSquare06Icon";
import { NavItem } from "./sidebar/nav-item";

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
  const location = useLocation();
  const basePath = `/${orgSlug}`;

  const tunnelPaths = [
    basePath,
    `${basePath}/tunnels`,
    `${basePath}/requests`,
    `${basePath}/subdomains`,
    `${basePath}/domains`,
    `${basePath}/install`,
  ];
  const isTunnelRoute = tunnelPaths.some((path) =>
    path === basePath
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`),
  );

  let product: ProductNavigation | null = null;

  if (isTunnelRoute) {
    product = {
      name: "Tunnels",
      items: [
        { label: "Overview", to: "/$orgSlug", icon: Home01Icon },
        {
          label: "Active tunnels",
          to: "/$orgSlug/tunnels",
          icon: Route03Icon,
        },
        {
          label: "Requests",
          to: "/$orgSlug/requests",
          icon: HistoryIcon,
        },
        {
          label: "Subdomains",
          to: "/$orgSlug/subdomains",
          icon: Globe02Icon,
        },
        {
          label: "Domains",
          to: "/$orgSlug/domains",
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
        {
          label: "Audit log",
          to: "/$orgSlug/secrets/audit",
          icon: Audit01Icon,
        },
      ],
    };
  }

  if (!product) return null;

  const isItemActive = (item: SubNavItem) => {
    const target = item.to.replace("/$orgSlug", basePath);
    if (item.exact) return location.pathname === target;
    if (item.to === "/$orgSlug") return location.pathname === basePath;
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
            />
          ))}
        </div>
      </nav>
    </aside>
  );
}
