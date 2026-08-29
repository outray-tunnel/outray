import { useLocation, useParams } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity03Icon,
  Alert02Icon,
  Globe02Icon,
  HistoryIcon,
  Home01Icon,
  Key01Icon,
  LinkSquare01Icon,
  LogsIcon,
  Route03Icon,
  ServerStack01Icon,
  SecurityLockIcon,
  ShieldKeyIcon,
  WorkflowSquare06Icon,
} from "@hugeicons-pro/core-stroke-rounded";
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
  upcoming?: Array<{ label: string; icon: IconSvgElement }>;
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
          label: "Monitors",
          to: "/$orgSlug/observability/monitors",
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
        },
      ],
      upcoming: [
        { label: "Vaults", icon: ShieldKeyIcon },
        { label: "Environments", icon: Key01Icon },
        { label: "Access policies", icon: SecurityLockIcon },
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

        {product.upcoming && (
          <div className="mt-6">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.11em] text-zinc-600">
              Coming next
            </p>
            <div className="space-y-0.5">
              {product.upcoming.map((item) => (
                <div
                  key={item.label}
                  className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-zinc-600"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={18}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-700">
                    Soon
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
