import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bug, Check, CreditCard, KeyRound, LogOut, Plus, Settings2, Users, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authClient, usePermission } from "@/lib/auth-client";
import { useAppStore } from "@/lib/store";
import { mobileItemIsActive, mobileProductForPath, mobileProducts } from "./mobile-navigation";
import { ReportBugModal } from "./report-bug-modal";
import { useInstance } from "@/lib/instance-context";

export function MobileNavSheet({ isOpen, onClose, orgSlug }: { isOpen: boolean; onClose: () => void; orgSlug: string }) {
  const location = useLocation();
  const instance = useInstance();
  const navigate = useNavigate();
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data: session } = authClient.useSession();
  const { data: organizationData } = authClient.useListOrganizations();
  const organizations = organizationData ?? [];
  const { data: canManageBilling } = usePermission({ billing: ["manage"] });
  const { data: canManageShares } = usePermission({ secretShare: ["create"] });
  const setSelectedOrganization = useAppStore((state) => state.setSelectedOrganization);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const selectedOrg = organizations.find((org) => org.slug === orgSlug);
  const product = mobileProductForPath(location.pathname, orgSlug);
  const user = session?.user;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  const signOut = async () => {
    onClose();
    await authClient.signOut();
    void navigate({ to: "/", search: { redirect: undefined } });
  };

  return <>
    {isOpen && typeof document !== "undefined" && createPortal(<dialog ref={dialogRef} id="mobile-workspace-navigation" aria-labelledby={headingId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-dvh w-screen max-w-none overflow-hidden bg-[#0b0b0d] p-0 text-zinc-200 outline-none backdrop:bg-black/75 md:hidden">
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0"><p className="truncate text-[11px] text-zinc-500">{selectedOrg?.name || "OutRay"}</p><h2 id={headingId} className="mt-0.5 text-lg font-normal tracking-tight text-zinc-100">Navigation</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close navigation" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] text-zinc-400 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-violet-400"><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          <section aria-labelledby="mobile-products-heading" className="pt-6">
            <h3 id="mobile-products-heading" className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">Products</h3>
            <div className="grid grid-cols-2 gap-2">{mobileProducts.filter((item) => instance.products.includes(item.key)).map((item) => {
              const active = product?.key === item.key;
              return <Link key={item.key} to={item.to} params={{ orgSlug }} onClick={onClose} aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${active ? "border-white/[0.15] bg-white/[0.07] text-zinc-100" : "border-white/[0.08] text-zinc-400 hover:border-white/[0.14] hover:bg-white/[0.035] hover:text-zinc-200"}`}>
                <HugeiconsIcon icon={item.icon} size={19} strokeWidth={1.7} className="shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{item.label}</span>{active && <Check size={14} className="ml-auto shrink-0 text-zinc-300" aria-hidden="true" />}
              </Link>;
            })}</div>
          </section>

          {product && <section aria-labelledby="mobile-pages-heading" className="pt-8">
            <h3 id="mobile-pages-heading" className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">{product.label} pages</h3>
            <nav aria-label={`${product.label} pages`} className="divide-y divide-white/[0.06]">{product.pages.filter((item) => canManageShares || item.to !== "/$orgSlug/secrets/shares").map((item) => {
              const active = mobileItemIsActive(item, location.pathname, orgSlug);
              return <Link key={item.to} to={item.to} params={{ orgSlug }} onClick={onClose} aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-lg px-2 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${active ? "text-zinc-100" : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"}`}>
                <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.7} className="shrink-0" aria-hidden="true" /><span>{item.label}</span>{active && <span className="ml-auto size-1.5 rounded-full bg-violet-400" aria-hidden="true" />}
              </Link>;
            })}</nav>
          </section>}

          <section aria-labelledby="mobile-workspace-heading" className="pt-8">
            <h3 id="mobile-workspace-heading" className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">Workspace</h3>
            <nav aria-label="Workspace pages" className="divide-y divide-white/[0.06]">
              {[
                { to: "/$orgSlug/members", label: "Members", icon: Users },
                { to: "/$orgSlug/tokens", label: "API tokens", icon: KeyRound },
                ...(canManageBilling && instance.billingEnabled ? [{ to: "/$orgSlug/billing", label: "Billing", icon: CreditCard }] : []),
                { to: "/$orgSlug/settings", label: "Settings", icon: Settings2 },
              ].map((item) => {
                const target = item.to.replace("/$orgSlug", `/${orgSlug}`);
                const active = location.pathname === target || location.pathname.startsWith(`${target}/`);
                const Icon = item.icon;
                return <Link key={item.to} to={item.to} params={{ orgSlug }} onClick={onClose} aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-lg px-2 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${active ? "text-zinc-100" : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"}`}>
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{item.label}</span>{active && <span className="ml-auto size-1.5 rounded-full bg-violet-400" aria-hidden="true" />}
                </Link>;
              })}
            </nav>
          </section>

          {organizations.length > 1 && <section aria-labelledby="mobile-organizations-heading" className="pt-8">
            <h3 id="mobile-organizations-heading" className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">Organizations</h3>
            <div className="divide-y divide-white/[0.06]">{organizations.map((org) => <Link key={org.id} to="/$orgSlug/tunnel" params={{ orgSlug: org.slug }} onClick={() => { setSelectedOrganization(org); onClose(); }}
              aria-current={org.slug === orgSlug ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-lg px-2 text-[13px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-violet-400 ${org.slug === orgSlug ? "text-zinc-100" : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200"}`}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-xs">{org.name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{org.name}</span>{org.slug === orgSlug && <Check size={15} className="text-zinc-400" aria-hidden="true" />}
            </Link>)}</div>
          </section>}
          <Link to="/onboarding" onClick={onClose} className="mt-5 flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px] text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400"><Plus size={17} aria-hidden="true" />Create organization</Link>
        </div>

        <footer className="shrink-0 border-t border-white/[0.07] bg-[#0b0b0d] px-5 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-3 pb-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-xs text-zinc-300">{user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "?"}</span><span className="min-w-0"><span className="block truncate text-[13px] text-zinc-200">{user?.name || "Account"}</span><span className="block truncate text-[11px] text-zinc-500">{user?.email}</span></span></div>
          <div className="flex gap-2"><button type="button" onClick={() => { onClose(); setReportBugOpen(true); }} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.09] text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-400"><Bug size={15} aria-hidden="true" />Report a bug</button><button type="button" onClick={() => void signOut()} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-white/[0.09] text-xs text-zinc-400 hover:bg-white/[0.04] hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-violet-400"><LogOut size={15} aria-hidden="true" />Sign out</button></div>
        </footer>
      </div>
    </dialog>, document.body)}
    <ReportBugModal isOpen={reportBugOpen} onClose={() => setReportBugOpen(false)} userEmail={user?.email} userName={user?.name} />
  </>;
}
