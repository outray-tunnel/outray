import { Link, useLocation, useParams } from "@tanstack/react-router";
import { LayoutDashboard, Network, History, Globe, Menu } from "lucide-react";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Audit01Icon,
  Folder01Icon,
  Home01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { MobileNavSheet } from "./mobile-nav-sheet";

const NAV_ICON_SIZE = 22;

export function MobileBottomNav() {
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const location = useLocation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const tunnelNavItems = [
    {
      to: "/$orgSlug",
      icon: <LayoutDashboard size={NAV_ICON_SIZE} />,
      label: "Overview",
      activeOptions: { exact: true },
    },
    {
      to: "/$orgSlug/tunnels",
      icon: <Network size={NAV_ICON_SIZE} />,
      label: "Tunnels",
    },
    {
      to: "/$orgSlug/requests",
      icon: <History size={NAV_ICON_SIZE} />,
      label: "Requests",
    },
    {
      to: "/$orgSlug/subdomains",
      icon: <Globe size={NAV_ICON_SIZE} />,
      label: "Subdomains",
    },
  ];

  const secretNavItems = [
    {
      to: "/$orgSlug/secrets",
      icon: (
        <HugeiconsIcon
          icon={Home01Icon}
          size={NAV_ICON_SIZE}
          strokeWidth={1.7}
        />
      ),
      label: "Overview",
      activeOptions: { exact: true },
    },
    {
      to: "/$orgSlug/secrets/projects",
      icon: (
        <HugeiconsIcon
          icon={Folder01Icon}
          size={NAV_ICON_SIZE}
          strokeWidth={1.7}
        />
      ),
      label: "Projects",
    },
    {
      to: "/$orgSlug/secrets/audit",
      icon: (
        <HugeiconsIcon
          icon={Audit01Icon}
          size={NAV_ICON_SIZE}
          strokeWidth={1.7}
        />
      ),
      label: "Audit",
    },
  ];

  const mainNavItems = location.pathname.startsWith(`/${orgSlug}/secrets`)
    ? secretNavItems
    : tunnelNavItems;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#070707] border-t border-white/10 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {mainNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ orgSlug }}
              activeOptions={item.activeOptions}
              activeProps={{
                className: "text-accent",
              }}
              inactiveProps={{
                className: "text-gray-500",
              }}
              className="flex flex-col items-center justify-center w-full h-full transition-colors"
            >
              {item.icon}
            </Link>
          ))}
          <button
            onClick={() => setIsSheetOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-white transition-colors"
          >
            <Menu size={NAV_ICON_SIZE} />
          </button>
        </div>
      </nav>

      <MobileNavSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        orgSlug={orgSlug}
      />
    </>
  );
}
