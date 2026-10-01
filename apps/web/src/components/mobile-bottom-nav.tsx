import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { mobileItemIsActive, mobileProductForPath, mobileProducts } from "./mobile-navigation";

export function MobileBottomNav({ onOpenNavigation, isNavigationOpen }: {
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
}) {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const { pathname } = useLocation();
  const product = mobileProductForPath(pathname, orgSlug);
  const shortcuts = product?.pages.slice(0, 3) ?? mobileProducts.map((item) => ({
    to: item.to, label: item.label, shortLabel: item.label === "Observability" ? "Observe" : item.label,
    icon: item.icon, exact: true,
  }));
  const moreIsCurrent = !!product && !shortcuts.some((item) => mobileItemIsActive(item, pathname, orgSlug));

  return <nav aria-label="Mobile navigation" className="safe-area-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0b0b0d]/95 backdrop-blur-xl md:hidden">
    <div className={`grid h-[62px] gap-1 px-2 ${product ? "grid-cols-4" : "grid-cols-5"}`}>
      {shortcuts.map((item) => {
        const active = mobileItemIsActive(item, pathname, orgSlug);
        return <Link key={item.to} to={item.to} params={{ orgSlug }} aria-label={item.label} aria-current={active ? "page" : undefined}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}>
          <span className={`flex size-7 items-center justify-center rounded-lg ${active ? "bg-white/[0.09]" : ""}`}><HugeiconsIcon icon={item.icon} size={19} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="max-w-full truncate px-1">{item.shortLabel ?? item.label}</span>
        </Link>;
      })}
      {product && <button type="button" onClick={onOpenNavigation} aria-label="Open all navigation" aria-expanded={isNavigationOpen} aria-controls="mobile-workspace-navigation"
        className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${moreIsCurrent || isNavigationOpen ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}>
        <span className={`flex size-7 items-center justify-center rounded-lg ${moreIsCurrent || isNavigationOpen ? "bg-white/[0.09]" : ""}`}><Menu size={19} strokeWidth={1.8} aria-hidden="true" /></span>
        <span>All pages</span>
      </button>}
      {!product && <button type="button" onClick={onOpenNavigation} aria-label="Open navigation" aria-expanded={isNavigationOpen} aria-controls="mobile-workspace-navigation"
        className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-zinc-100 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400">
        <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.09]"><Menu size={19} strokeWidth={1.8} aria-hidden="true" /></span>
        <span>Menu</span>
      </button>}
    </div>
  </nav>;
}
