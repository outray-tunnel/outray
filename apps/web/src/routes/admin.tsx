import { createFileRoute, Link, Navigate, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminOverview } from "@/components/admin/admin-overview";
import { appClient } from "@/lib/app-client";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin - OutRay" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { data: session, isPending, error: sessionError, refetch: refetchSession } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const location = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["admin-access", session?.user.id],
    queryFn: () => appClient.admin.session(),
    enabled: !isPending && !!session?.user && !sessionError && !signingOut,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 60_000,
  });
  const accessDenied = access.data && "error" in access.data;

  useEffect(() => {
    if (!accessDenied && session?.user.id) return;
    void queryClient.cancelQueries({ queryKey: ["admin"] });
    queryClient.removeQueries({ queryKey: ["admin"] });
  }, [accessDenied, session?.user.id, queryClient]);

  const handleLogout = async () => {
    setSigningOut(true);
    setAuthError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Could not sign out. Please try again.");
      queryClient.clear();
      await router.navigate({ to: "/login", search: { redirect: `${location.pathname}${location.searchStr}` }, replace: true });
    } catch {
      setAuthError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  if (isPending || signingOut) {
    return <AdminAccessState title={signingOut ? "Signing out…" : "Checking admin access…"} />;
  }

  if (sessionError) {
    return (
      <AdminAccessState title="Could not verify your session" message="Please try again before accessing the admin dashboard.">
        <button type="button" onClick={() => refetchSession()} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Try again</button>
      </AdminAccessState>
    );
  }

  if (!session?.user) {
    return <Navigate to="/login" search={{ redirect: `${location.pathname}${location.searchStr}` }} replace />;
  }

  if (access.isPending) {
    return <AdminAccessState title="Checking admin access…" />;
  }

  if (!access.data || "error" in access.data || access.data.user.id !== session.user.id || access.data.user.isAdmin !== true) {
    const forbidden = access.data && "error" in access.data && access.data.error === "Forbidden";
    const expired = access.data && "error" in access.data && access.data.error === "Unauthorized";
    return (
      <AdminAccessState
        title={forbidden ? "Admin access required" : expired ? "Sign in again" : "Could not verify admin access"}
        message={forbidden ? `You're signed in as ${session.user.email}. This profile does not have platform admin access.` : expired ? "Your session has expired. Sign in with GitHub or Google to continue." : "Please try again. No admin data has been loaded."}
      >
        {authError ? <p role="alert" className="text-sm text-red-400">{authError}</p> : null}
        {forbidden ? <Link to="/select" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Back to workspace</Link> : null}
        {!forbidden && !expired ? <button type="button" onClick={() => void access.refetch()} className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black">Try again</button> : null}
        <button type="button" onClick={() => void handleLogout()} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300">Sign in with another account</button>
      </AdminAccessState>
    );
  }

  // Check if we're on the root /admin path (not a child route)
  const isRootAdmin = location.pathname === "/admin" || location.pathname === "/admin/";
  const section = location.pathname.split("/")[2];
  const sectionLabel = ({ usage: "Product usage", users: "Users", organizations: "Organizations", subscriptions: "Subscriptions", tunnels: "Tunnels", charts: "Analytics", actions: "Maintenance" } as Record<string, string>)[section] || "Overview";

  return (
    <div className="min-h-screen bg-[#080808] font-sans text-zinc-200">
      <AdminSidebar onLogout={() => void handleLogout()} user={session.user} />
      <main id="admin-main" className="min-h-screen min-w-0 md:ml-[248px]">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-white/[.06] px-4 text-[12px] sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2.5"><Link to="/admin" className="rounded text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-accent">Administration</Link><span aria-hidden="true" className="text-zinc-700">/</span><span className="truncate text-zinc-300" aria-current="page">{sectionLabel}</span></nav>
          <span className="shrink-0 rounded-md border border-white/[.07] bg-white/[.02] px-2 py-1 text-[10px] text-zinc-500">Admin profile</span>
        </header>
        <div className="px-4 py-7 sm:px-6 lg:px-8 lg:py-8">
          {authError ? <p role="alert" className="mb-4 text-sm text-red-400">{authError}</p> : null}
          {isRootAdmin ? <AdminOverview /> : <Outlet />}
        </div>
      </main>
    </div>
  );
}

function AdminAccessState({ title, message, children }: { title: string; message?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] p-4 font-sans">
      <div className="w-full max-w-sm rounded-xl border border-white/[.08] bg-[#101010] p-7 text-center">
        <img src="/logo.png" alt="OutRay" className="mx-auto mb-5 w-12" />
        <h1 className="text-[17px] font-medium tracking-tight text-zinc-100" aria-live="polite">{title}</h1>
        {message ? <p className="mt-2 text-[12px] leading-5 text-zinc-500">{message}</p> : null}
        {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      </div>
    </main>
  );
}
