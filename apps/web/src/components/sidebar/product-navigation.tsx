import ArrowDown01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowDown01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { mobileItemIsActive, mobileProductForPath } from "../mobile-navigation";
import { ActiveTunnelBadge } from "./active-tunnel-badge";
import { useInstance } from "@/lib/instance-context";
import {
  filterSidebarProducts,
  initialProductOpenState,
  normalizeProductNavigationPath,
  openProductForPath,
  toggleProductOpen,
} from "./product-navigation-state";

export interface ProductNavigationProps {
  orgSlug: string;
  pathname: string;
  isCollapsed: boolean;
  searchQuery: string;
  canManageShares: boolean;
  activeTunnelsCount?: number;
}

const storageKey = (orgSlug: string) => `outray.sidebar.products.v1:${orgSlug}`;

export function ProductNavigation({
  orgSlug,
  pathname,
  isCollapsed,
  searchQuery,
  canManageShares,
  activeTunnelsCount,
}: ProductNavigationProps) {
  const instanceId = useId();
  const hydratedOrg = useRef<string | null>(null);
  const [storageReadyOrg, setStorageReadyOrg] = useState<string | null>(null);
  const [openChoices, setOpenChoices] = useState(() =>
    initialProductOpenState(pathname, orgSlug),
  );
  const instance = useInstance();
  const products = filterSidebarProducts(searchQuery, canManageShares, instance.products);
  const normalizedPathname = normalizeProductNavigationPath(pathname);
  const currentProduct = mobileProductForPath(normalizedPathname, orgSlug);
  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    const isNewOrganization = hydratedOrg.current !== orgSlug;
    let saved: unknown;

    if (isNewOrganization) {
      try {
        const stored = window.localStorage.getItem(storageKey(orgSlug));
        saved = stored ? JSON.parse(stored) : undefined;
      } catch {
        // Navigation remains usable when storage is blocked or malformed.
      }
      hydratedOrg.current = orgSlug;
    }

    setOpenChoices((choices) =>
      isNewOrganization
        ? initialProductOpenState(pathname, orgSlug, saved)
        : openProductForPath(choices, pathname, orgSlug),
    );
    setStorageReadyOrg(orgSlug);
  }, [orgSlug, pathname]);

  useEffect(() => {
    if (storageReadyOrg !== orgSlug) return;
    try {
      window.localStorage.setItem(
        storageKey(orgSlug),
        JSON.stringify(openChoices),
      );
    } catch {
      // Persistence is optional; section choices still work for this visit.
    }
  }, [openChoices, orgSlug, storageReadyOrg]);

  if (products.length === 0) return null;

  if (isCollapsed) {
    return (
      <div className="space-y-1" role="group" aria-label="Products">
        {products.map((product) => {
          const active = currentProduct?.key === product.key;
          return (
            <Link
              key={product.key}
              to={product.to}
              params={{ orgSlug }}
              activeOptions={{ exact: true }}
              activeProps={{}}
              inactiveProps={{}}
              aria-label={product.label}
              aria-current={active ? "page" : undefined}
              title={product.label}
              className={`relative flex h-10 w-full items-center justify-center rounded-lg transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
                active
                  ? "bg-white/[0.07] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200"
              }`}
            >
              <HugeiconsIcon
                icon={product.icon}
                size={18}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1" role="group" aria-label="Products">
      {products.map((product) => {
        const isOpen = isSearching || openChoices[product.key];
        const isCurrentProduct = currentProduct?.key === product.key;
        const buttonId = `product-navigation-${instanceId}-${product.key}-button`;
        const panelId = `product-navigation-${instanceId}-${product.key}-pages`;

        return (
          <div key={product.key}>
            <button
              id={buttonId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              disabled={isSearching}
              onClick={() =>
                setOpenChoices((choices) =>
                  toggleProductOpen(choices, product.key),
                )
              }
              className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-normal tracking-[-0.01em] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
                isCurrentProduct ? "text-zinc-200" : "text-zinc-400"
              } ${isSearching ? "cursor-default" : "hover:bg-white/[0.035] hover:text-zinc-200"}`}
            >
              <HugeiconsIcon
                icon={product.icon}
                size={17}
                strokeWidth={1.7}
                className="shrink-0"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{product.label}</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.7}
                className={`shrink-0 text-zinc-600 transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-0" : "-rotate-90"}`}
                aria-hidden="true"
              />
            </button>

            <div
              id={panelId}
              aria-labelledby={buttonId}
              aria-hidden={!isOpen}
              inert={!isOpen}
              className="grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none"
              style={{
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                opacity: isOpen ? 1 : 0,
              }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-0.5 pb-1 pt-0.5">
                  {product.pages.map((page) => {
                    const active = mobileItemIsActive(
                      page,
                      normalizedPathname,
                      orgSlug,
                    );
                    return (
                      <Link
                        key={page.to}
                        to={page.to}
                        params={{ orgSlug }}
                        activeOptions={{ exact: !!page.exact }}
                        activeProps={{}}
                        inactiveProps={{}}
                        aria-current={active ? "page" : undefined}
                        tabIndex={isOpen ? undefined : -1}
                        className={`flex h-8 items-center gap-2 rounded-lg pl-[39px] pr-3 text-[13px] font-normal tracking-[-0.01em] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
                          active
                            ? "bg-white/[0.065] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.045)]"
                            : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{page.label}</span>
                        {page.to === "/$orgSlug/tunnel/tunnels" && (
                          <ActiveTunnelBadge count={activeTunnelsCount} />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
