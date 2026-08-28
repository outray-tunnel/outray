import { useLocation, useParams } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Activity03Icon,
  Analytics03Icon,
  Globe02Icon,
  HistoryIcon,
  Home01Icon,
  Key01Icon,
  LinkSquare01Icon,
  LogsIcon,
  Route03Icon,
  SecurityLockIcon,
  ShieldKeyIcon,
  WorkflowSquare06Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { NavItem } from "./sidebar/nav-item";

interface SubNavItem {
  label: string;
  to: string;
  icon: IconSvgElement;
}

interface ProductNavigation {
  name: string;
  description: string;
  status: "Live" | "Preview";
  icon: IconSvgElement;
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
      description: "Public access for local services",
      status: "Live",
      icon: Route03Icon,
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
      description: "Understand every request",
      status: "Preview",
      icon: Analytics03Icon,
      items: [
        {
          label: "Overview",
          to: "/$orgSlug/observability",
          icon: Home01Icon,
        },
      ],
      upcoming: [
        { label: "Metrics", icon: Activity03Icon },
        { label: "Logs", icon: LogsIcon },
        { label: "Traces", icon: WorkflowSquare06Icon },
      ],
    };
  } else if (location.pathname.startsWith(`${basePath}/secrets`)) {
    product = {
      name: "Secrets",
      description: "Secure application configuration",
      status: "Preview",
      icon: SecurityLockIcon,
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
    if (item.to === "/$orgSlug") return location.pathname === basePath;
    return (
      location.pathname === target || location.pathname.startsWith(`${target}/`)
    );
  };

  return (
    <aside
      className="flex h-full w-[208px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0c0c0c] px-3"
      aria-label={`${product.name} navigation`}
    >
      <div className="border-b border-white/[0.06] px-2 pb-4 pt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] text-zinc-300 ring-1 ring-white/[0.07]">
            <HugeiconsIcon
              icon={product.icon}
              size={15}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] ${
              product.status === "Live"
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-accent/10 text-accent"
            }`}
          >
            {product.status}
          </span>
        </div>
        <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-zinc-100">
          {product.name}
        </h2>
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">
          {product.description}
        </p>
      </div>

      <nav className="flex-1 py-4">
        <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.11em] text-zinc-700">
          Product
        </p>
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
            <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[0.11em] text-zinc-700">
              Coming next
            </p>
            <div className="space-y-0.5">
              {product.upcoming.map((item) => (
                <div
                  key={item.label}
                  className="flex h-8 items-center gap-2.5 px-2 text-[12px] text-zinc-700"
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={15}
                    strokeWidth={1.6}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[9px] uppercase tracking-[0.08em] text-zinc-800">
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
