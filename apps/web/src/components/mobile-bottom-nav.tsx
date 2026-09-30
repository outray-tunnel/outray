import { Link, useLocation, useParams } from "@tanstack/react-router";
import { LayoutDashboard, Network, History, Globe, Menu } from "lucide-react";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Audit01Icon from "@hugeicons-pro/core-stroke-rounded/Audit01Icon";
import Folder01Icon from "@hugeicons-pro/core-stroke-rounded/Folder01Icon";
import Home01Icon from "@hugeicons-pro/core-stroke-rounded/Home01Icon";
import HeartPulseIcon from "@hugeicons-pro/core-stroke-rounded/HeartPulseIcon";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import Notification02Icon from "@hugeicons-pro/core-stroke-rounded/Notification02Icon";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
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
      to: "/$orgSlug/secrets/vaults",
      icon: (
        <HugeiconsIcon
          icon={Folder01Icon}
          size={NAV_ICON_SIZE}
          strokeWidth={1.7}
        />
      ),
      label: "Vaults",
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

  const uptimeNavItems = [
    { to: "/$orgSlug/uptime", icon: <HugeiconsIcon icon={Home01Icon} size={NAV_ICON_SIZE} strokeWidth={1.7} />, label: "Overview", activeOptions: { exact: true } },
    { to: "/$orgSlug/uptime/monitors", icon: <HugeiconsIcon icon={HeartPulseIcon} size={NAV_ICON_SIZE} strokeWidth={1.7} />, label: "Monitors" },
    { to: "/$orgSlug/uptime/incidents", icon: <HugeiconsIcon icon={Alert02Icon} size={NAV_ICON_SIZE} strokeWidth={1.7} />, label: "Incidents" },
    { to: "/$orgSlug/uptime/notifications", icon: <HugeiconsIcon icon={Notification02Icon} size={NAV_ICON_SIZE} strokeWidth={1.7} />, label: "Notifications" },
    { to: "/$orgSlug/uptime/status-page", icon: <HugeiconsIcon icon={Globe02Icon} size={NAV_ICON_SIZE} strokeWidth={1.7} />, label: "Status page" },
  ];

  const mainNavItems = location.pathname.startsWith(`/${orgSlug}/secrets`)
    ? secretNavItems
    : location.pathname.startsWith(`/${orgSlug}/uptime`)
      ? uptimeNavItems
    : tunnelNavItems;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#070707] border-t border-white/10 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {mainNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
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
            aria-label="More navigation"
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
