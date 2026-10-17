import { Link, useLocation } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import DashboardSquare01Icon from "@outray/icons/stroke/DashboardSquare01Icon";
import UserGroupIcon from "@outray/icons/stroke/UserGroupIcon";
import Building03Icon from "@outray/icons/stroke/Building03Icon";
import WalletCardsIcon from "@outray/icons/stroke/WalletCardsIcon";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import ChartLineData01Icon from "@outray/icons/stroke/ChartLineData01Icon";
import Settings02Icon from "@outray/icons/stroke/Settings02Icon";
import Analytics01Icon from "@outray/icons/stroke/Analytics01Icon";
import DashboardSquare01SolidIcon from "@outray/icons/solid/DashboardSquare01Icon";
import UserGroupSolidIcon from "@outray/icons/solid/UserGroupIcon";
import Building03SolidIcon from "@outray/icons/solid/Building03Icon";
import WalletCardsSolidIcon from "@outray/icons/solid/WalletCardsIcon";
import Cone01SolidIcon from "@outray/icons/solid/Cone01Icon";
import ChartLineData01SolidIcon from "@outray/icons/solid/ChartLineData01Icon";
import Settings02SolidIcon from "@outray/icons/solid/Settings02Icon";
import Analytics01SolidIcon from "@outray/icons/solid/Analytics01Icon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import Pulse02SolidIcon from "@outray/icons/solid/Pulse02Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import LockPasswordSolidIcon from "@outray/icons/solid/LockPasswordIcon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import HeartPulseSolidIcon from "@outray/icons/solid/HeartPulseIcon";
import AiChat02Icon from "@outray/icons/stroke/AiChat02Icon";
import AiChat02SolidIcon from "@outray/icons/solid/AiChat02Icon";
import Logout02Icon from "@outray/icons/stroke/Logout02Icon";
import ArrowUpRight01Icon from "@outray/icons/stroke/ArrowUpRight01Icon";
import { Button } from "../arc/button/button";
import { NavItem } from "../sidebar/nav-item";
import { workspaceScopeClassName } from "../ui/workspace-scope";

interface AdminSidebarProps {
  onLogout: () => void;
  user?: { name: string; email: string; image?: string | null };
}

const navGroups: Array<{ label: string; items: Array<{ path: string; label: string; icon: IconSvgElement; activeIcon: IconSvgElement; exact?: boolean }> }> = [
  { label: "Platform", items: [
  { path: "/admin", label: "Overview", icon: DashboardSquare01Icon, activeIcon: DashboardSquare01SolidIcon, exact: true },
  { path: "/admin/usage", label: "Product usage", icon: Analytics01Icon, activeIcon: Analytics01SolidIcon },
  { path: "/admin/charts", label: "Analytics", icon: ChartLineData01Icon, activeIcon: ChartLineData01SolidIcon },
  ] },
  { label: "Products", items: [
  { path: "/admin/tunnels", label: "Tunnels", icon: Cone01Icon, activeIcon: Cone01SolidIcon },
  { path: "/admin/observability", label: "Observability", icon: Pulse02Icon, activeIcon: Pulse02SolidIcon },
  { path: "/admin/secrets", label: "Secrets", icon: LockPasswordIcon, activeIcon: LockPasswordSolidIcon },
  { path: "/admin/uptime", label: "Uptime", icon: HeartPulseIcon, activeIcon: HeartPulseSolidIcon },
  { path: "/admin/agent", label: "Agent", icon: AiChat02Icon, activeIcon: AiChat02SolidIcon },
  ] },
  { label: "Manage", items: [
  { path: "/admin/users", label: "Users", icon: UserGroupIcon, activeIcon: UserGroupSolidIcon },
  { path: "/admin/organizations", label: "Organizations", icon: Building03Icon, activeIcon: Building03SolidIcon },
  { path: "/admin/subscriptions", label: "Subscriptions", icon: WalletCardsIcon, activeIcon: WalletCardsSolidIcon },
  { path: "/admin/actions", label: "Maintenance", icon: Settings02Icon, activeIcon: Settings02SolidIcon },
  ] },
];

export function AdminSidebar({ onLogout, user }: AdminSidebarProps) {
  const location = useLocation();
  const groups = navGroups.map((group) => ({ ...group, links: group.items.map((item) => {
    const active = item.exact ? location.pathname === item.path || location.pathname === `${item.path}/` : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
    return <NavItem key={item.path} to={item.path} label={item.label} icon={item.icon} activeIcon={item.activeIcon} isActive={active} activeOptions={{ exact: !!item.exact }} compact isCollapsed={false} />;
  }) }));
  const brand = <Link to="/admin" aria-label="OutRay administration" className="flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"><img src="/logo.png" alt="" className="size-8 object-contain" /><span className="text-[17px] font-semibold tracking-[-.03em] text-zinc-100">OutRay</span><span className="ml-1 rounded-md border border-white/[.08] px-1.5 py-0.5 text-[10px] leading-4 text-zinc-500">Admin</span></Link>;

  return <>
    <aside className={`${workspaceScopeClassName} fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[.07] bg-[#090909] md:flex`}>
      <div className="flex h-16 shrink-0 items-center px-3">{brand}</div>
      <nav aria-label="Administration" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">{groups.map((group) => <div key={group.label}><p className="mb-2 px-3 text-[11px] text-zinc-600">{group.label}</p><div className="space-y-0.5">{group.links}</div></div>)}</nav>
      <div className="space-y-4 px-3 pb-4">
        <Link to="/select" className="flex h-9 items-center justify-between rounded-lg px-3 text-[12px] text-zinc-500 transition-colors hover:bg-white/[.035] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent">Back to console<HugeiconsIcon icon={ArrowUpRight01Icon} size={15} aria-hidden="true" /></Link>
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[.07] bg-white/[.015] p-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[.06] text-[12px] text-zinc-400">{user?.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : (user?.name || "A").charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-[12px] text-zinc-200">{user?.name || "Administrator"}</p><p className="mt-0.5 truncate text-[10px] text-zinc-500" title={user?.email}>{user?.email || "Platform admin"}</p></div>
          <Button type="button" variant="ghost" size="sm" onClick={onLogout} aria-label="Sign out" title="Sign out" className="w-7 min-w-7! px-0!"><HugeiconsIcon icon={Logout02Icon} size={16} aria-hidden="true" /></Button>
        </div>
      </div>
    </aside>
    <div className={`${workspaceScopeClassName} border-b border-white/[.07] bg-[#090909] md:hidden`}><div className="flex h-16 items-center justify-between gap-4 px-3">{brand}<Button type="button" variant="ghost" size="sm" onClick={onLogout}>Sign out</Button></div><nav aria-label="Administration" className="flex gap-0.5 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&_a]:w-auto [&_a]:shrink-0">{groups.flatMap((group) => group.links)}</nav></div>
  </>;
}
