import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, CreditCard, KeyRound, Plug, Settings2, Users, UserRound, type LucideIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { usePermission } from "@/lib/auth-client";
import { useInstance } from "@/lib/instance-context";
import { organizationSettingsItems, personalSettingsItems, settingsItemIsActive, type SettingsNavigationItem } from "./settings-navigation-state";

const settingsIcons: Record<string, LucideIcon> = {
  General: Settings2,
  Members: Users,
  "API tokens": KeyRound,
  Billing: CreditCard,
  "Connected apps": Plug,
};

export function SettingsNavigation({ items, label, onNavigate, isCollapsed = false }: { items: readonly SettingsNavigationItem[]; label: string; onNavigate?: () => void; isCollapsed?: boolean }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return <nav aria-label={label} className="space-y-1">{items.map((item) => {
    const active = settingsItemIsActive(item, pathname);
    const Icon = settingsIcons[item.label] ?? Settings2;
    return <Link key={item.href} to={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={isCollapsed ? item.label : undefined} title={isCollapsed ? item.label : undefined}
      className={`flex min-h-10 items-center rounded-lg text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${isCollapsed ? "mx-auto size-10 justify-center" : "gap-3 px-3"} ${active ? "bg-white/[.075] font-medium text-zinc-100" : "text-zinc-500 hover:bg-white/[.045] hover:text-zinc-200"}`}><Icon size={17} strokeWidth={1.7} aria-hidden="true" />{!isCollapsed && item.label}</Link>;
  })}</nav>;
}

export function SettingsNavigationDisclosure({ items, label, backHref }: { items: readonly SettingsNavigationItem[]; label: string; backHref: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = items.find((item) => settingsItemIsActive(item, pathname))?.label || "General";
  return <div className="shrink-0 border-b border-white/[.07] bg-[#090909] px-4 py-2 md:hidden" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" aria-label={`${label}: ${current}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((previous) => !previous)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-[13px] text-zinc-300 focus-visible:outline-2 focus-visible:outline-accent">
      <span><span className="text-zinc-500">{label}</span><span className="mx-2 text-zinc-700" aria-hidden="true">/</span>{current}</span><ChevronDown size={15} className={open ? "rotate-180" : ""} aria-hidden="true" />
    </button>
    {open && <div id={id} className="pb-3"><Link to={backHref} onClick={() => setOpen(false)} className="mb-2 flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent"><ArrowLeft size={14} aria-hidden="true" />Back to dashboard</Link><SettingsNavigation items={items} label={label} onNavigate={() => setOpen(false)} /></div>}
  </div>;
}

/** Navigation content inside the shared sidebar; no shell, branding or picker. */
export function SidebarSettingsNavigation({ mode, orgSlug, backHref, isCollapsed, billing, query }: {
  mode: "organization" | "personal";
  orgSlug: string;
  backHref: string;
  isCollapsed: boolean;
  billing: boolean;
  query: string;
}) {
  const label = mode === "personal" ? "Personal settings" : "Organization settings";
  const items = mode === "personal" ? personalSettingsItems : organizationSettingsItems(orgSlug, billing);
  const matches = items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const footerLabel = mode === "organization" ? "Personal settings" : orgSlug ? "Organization settings" : "Your workspaces";
  const footerHref = mode === "organization" ? "/account/settings" : orgSlug ? `/${encodeURIComponent(orgSlug)}/settings/organization` : "/select";
  return <div className="flex flex-1 flex-col">
    <Link to={backHref} aria-label={isCollapsed ? "Back to dashboard" : undefined} title={isCollapsed ? "Back to dashboard" : undefined} className={`mb-4 flex min-h-10 items-center rounded-lg text-xs text-zinc-500 hover:bg-white/[.045] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent ${isCollapsed ? "mx-auto size-10 justify-center" : "gap-3 px-3"}`}><ArrowLeft size={17} aria-hidden="true" />{!isCollapsed && "Back to dashboard"}</Link>
    {!isCollapsed && <h2 className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[.11em] text-zinc-700">{label}</h2>}
    <SettingsNavigation items={matches} label={label} isCollapsed={isCollapsed} />
    {!matches.length && !isCollapsed && <p className="px-3 py-4 text-xs text-zinc-500">No settings match “{query}”.</p>}
    <Link to={footerHref} aria-label={isCollapsed ? footerLabel : undefined} title={isCollapsed ? footerLabel : undefined} className={`mt-auto flex min-h-10 items-center rounded-lg text-xs text-zinc-500 hover:bg-white/[.045] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent ${isCollapsed ? "mx-auto size-10 justify-center" : "gap-3 px-3"}`}><UserRound size={17} aria-hidden="true" />{!isCollapsed && footerLabel}</Link>
  </div>;
}

export function OrganizationSettingsMobileNavigation({ orgSlug }: { orgSlug: string }) {
  const { data: canManageBilling } = usePermission({ billing: ["manage"] });
  const instance = useInstance();
  return <SettingsNavigationDisclosure items={organizationSettingsItems(orgSlug, Boolean(canManageBilling && instance.billingEnabled))} label="Organization settings" backHref={`/${encodeURIComponent(orgSlug)}`} />;
}
