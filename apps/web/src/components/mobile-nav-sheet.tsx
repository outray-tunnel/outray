import { Link, useLocation } from "@tanstack/react-router";
import {
  X,
  Link2,
  CreditCard,
  Users,
  Key,
  Settings,
  Bug,
  LogOut,
  Building2,
  Check,
  Plus,
} from "lucide-react";
import { authClient, usePermission } from "@/lib/auth-client";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ReportBugModal } from "./report-bug-modal";
import { useAppStore } from "@/lib/store";

interface MobileNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
}

const NAV_ICON_SIZE = 20;

export function MobileNavSheet({
  isOpen,
  onClose,
  orgSlug,
}: MobileNavSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = authClient.useSession();
  const { data: organizations = [] } = authClient.useListOrganizations();
  const user = session?.user;
  const [isReportBugModalOpen, setIsReportBugModalOpen] = useState(false);

  const { setSelectedOrganization } = useAppStore();

  const { data: canManageBilling } = usePermission({
    billing: ["manage"],
  });

  const selectedOrg =
    organizations?.find((org) => org.slug === orgSlug) || organizations?.[0];

  const handleLogout = async () => {
    await authClient.signOut();
    navigate({ to: "/", search: { redirect: undefined } });
  };

  const moreNavItems = [
    {
      to: "/$orgSlug/domains",
      icon: <Link2 size={NAV_ICON_SIZE} />,
      label: "Domains",
    },
    canManageBilling && {
      to: "/$orgSlug/billing",
      icon: <CreditCard size={NAV_ICON_SIZE} />,
      label: "Billing",
    },
    {
      to: "/$orgSlug/members",
      icon: <Users size={NAV_ICON_SIZE} />,
      label: "Members",
    },
    {
      to: "/$orgSlug/tokens",
      icon: <Key size={NAV_ICON_SIZE} />,
      label: "API Tokens",
    },
    {
      to: "/$orgSlug/settings",
      icon: <Settings size={NAV_ICON_SIZE} />,
      label: "Settings",
    },
  ].filter(Boolean) as { to: string; icon: React.ReactNode; label: string }[];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-[#0a0a0a] border-t border-white/10 rounded-t-3xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-white">
                    {user.name?.charAt(0).toUpperCase() ||
                      user.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav items */}
        <div className="px-4 pb-4 space-y-1">
          {moreNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ orgSlug }}
              onClick={onClose}
              activeProps={{
                className: "bg-accent/10 text-accent border-accent/20",
              }}
              inactiveProps={{
                className: "text-gray-400 border-transparent hover:bg-white/5",
              }}
              className="flex items-center gap-4 w-full px-4 py-3.5 text-sm rounded-xl transition-colors border"
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Organizations section */}
        {organizations && organizations.length > 1 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider px-4 mb-2">
              Switch Organization
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {/* Current org - shown first with indicator */}
              {selectedOrg && (
                <div className="flex items-center justify-between gap-3 w-full px-4 py-3 text-sm text-accent bg-accent/10 border border-accent/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Building2 size={NAV_ICON_SIZE} />
                    <span>{selectedOrg.name}</span>
                  </div>
                  <Check size={16} className="text-accent" />
                </div>
              )}
              {/* Other orgs */}
              {organizations
                .filter((org) => org.slug !== orgSlug)
                .map((org) => (
                  <Link
                    key={org.id}
                    to={location.pathname.replace(/^\/[^/]+/, `/${org.slug}`)}
                    onClick={() => {
                      setSelectedOrganization(org);
                      onClose();
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                  >
                    <Building2 size={NAV_ICON_SIZE} />
                    <span>{org.name}</span>
                  </Link>
                ))}
            </div>
            {/* Create organization button */}
            <div className="pt-2 border-t border-white/5 mt-2">
              <Link
                to="/onboarding"
                onClick={onClose}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              >
                <Plus size={NAV_ICON_SIZE} />
                <span>Create Organization</span>
              </Link>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="px-4 pb-6 pt-2 border-t border-white/5 space-y-1">
          <button
            onClick={() => {
              onClose();
              setIsReportBugModalOpen(true);
            }}
            className="flex items-center gap-4 w-full px-4 py-3.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <Bug size={NAV_ICON_SIZE} />
            <span>Report a Bug</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 w-full px-4 py-3.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
          >
            <LogOut size={NAV_ICON_SIZE} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      <ReportBugModal
        isOpen={isReportBugModalOpen}
        onClose={() => setIsReportBugModalOpen(false)}
        userEmail={user?.email}
      />
    </>
  );
}
