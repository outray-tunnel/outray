import type { IconSvgElement } from "@hugeicons/react";
import Activity03Icon from "@hugeicons-pro/core-stroke-rounded/Activity03Icon";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import Audit01Icon from "@hugeicons-pro/core-stroke-rounded/Audit01Icon";
import Cone01Icon from "@hugeicons-pro/core-stroke-rounded/Cone01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Folder01Icon from "@hugeicons-pro/core-stroke-rounded/Folder01Icon";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
import HeartPulseIcon from "@hugeicons-pro/core-stroke-rounded/HeartPulseIcon";
import HistoryIcon from "@hugeicons-pro/core-stroke-rounded/HistoryIcon";
import Home01Icon from "@hugeicons-pro/core-stroke-rounded/Home01Icon";
import LinkSquare01Icon from "@hugeicons-pro/core-stroke-rounded/LinkSquare01Icon";
import LockPasswordIcon from "@hugeicons-pro/core-stroke-rounded/LockPasswordIcon";
import LogsIcon from "@hugeicons-pro/core-stroke-rounded/LogsIcon";
import Notification02Icon from "@hugeicons-pro/core-stroke-rounded/Notification02Icon";
import Pulse02Icon from "@hugeicons-pro/core-stroke-rounded/Pulse02Icon";
import Route03Icon from "@hugeicons-pro/core-stroke-rounded/Route03Icon";
import ServerStack01Icon from "@hugeicons-pro/core-stroke-rounded/ServerStack01Icon";
import WorkflowSquare06Icon from "@hugeicons-pro/core-stroke-rounded/WorkflowSquare06Icon";

export interface MobileNavItem {
  label: string;
  shortLabel?: string;
  to: string;
  icon: IconSvgElement;
  exact?: boolean;
}

export interface MobileProduct {
  key: "tunnels" | "observability" | "secrets" | "uptime";
  label: string;
  to: string;
  icon: IconSvgElement;
  pages: MobileNavItem[];
}

export const mobileProducts: MobileProduct[] = [
  { key: "tunnels", label: "Tunnels", to: "/$orgSlug", icon: Cone01Icon, pages: [
    { label: "Overview", to: "/$orgSlug", icon: Home01Icon, exact: true },
    { label: "Active tunnels", shortLabel: "Tunnels", to: "/$orgSlug/tunnels", icon: Route03Icon },
    { label: "Requests", to: "/$orgSlug/requests", icon: HistoryIcon },
    { label: "Subdomains", to: "/$orgSlug/subdomains", icon: Globe02Icon },
    { label: "Domains", to: "/$orgSlug/domains", icon: LinkSquare01Icon },
  ] },
  { key: "observability", label: "Observability", to: "/$orgSlug/observability", icon: Pulse02Icon, pages: [
    { label: "Overview", to: "/$orgSlug/observability", icon: Home01Icon, exact: true },
    { label: "Services", to: "/$orgSlug/observability/services", icon: ServerStack01Icon },
    { label: "Requests", to: "/$orgSlug/observability/requests", icon: Route03Icon },
    { label: "Metrics", to: "/$orgSlug/observability/metrics", icon: Activity03Icon },
    { label: "Logs", to: "/$orgSlug/observability/logs", icon: LogsIcon },
    { label: "Traces", to: "/$orgSlug/observability/traces", icon: WorkflowSquare06Icon },
    { label: "Alerts", to: "/$orgSlug/observability/alerts", icon: Alert02Icon },
  ] },
  { key: "secrets", label: "Secrets", to: "/$orgSlug/secrets", icon: LockPasswordIcon, pages: [
    { label: "Overview", to: "/$orgSlug/secrets", icon: Home01Icon, exact: true },
    { label: "Vaults", to: "/$orgSlug/secrets/vaults", icon: Folder01Icon },
    { label: "Shares", to: "/$orgSlug/secrets/shares", icon: LinkSquare01Icon },
    { label: "Trash", to: "/$orgSlug/secrets/trash", icon: Delete02Icon },
    { label: "Audit log", shortLabel: "Audit", to: "/$orgSlug/secrets/audit", icon: Audit01Icon },
  ] },
  { key: "uptime", label: "Uptime", to: "/$orgSlug/uptime", icon: HeartPulseIcon, pages: [
    { label: "Overview", to: "/$orgSlug/uptime", icon: Home01Icon, exact: true },
    { label: "Monitors", to: "/$orgSlug/uptime/monitors", icon: HeartPulseIcon },
    { label: "Incidents", to: "/$orgSlug/uptime/incidents", icon: Alert02Icon },
    { label: "Notifications", to: "/$orgSlug/uptime/notifications", icon: Notification02Icon },
    { label: "Status page", shortLabel: "Status", to: "/$orgSlug/uptime/status-page", icon: Globe02Icon },
  ] },
];

export function mobileProductForPath(pathname: string, orgSlug: string): MobileProduct | null {
  const base = `/${orgSlug}`;
  if (pathname === base) return mobileProducts[0];
  const relative = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
  if (relative === "observability" || relative.startsWith("observability/")) return mobileProducts[1];
  if (relative === "secrets" || relative.startsWith("secrets/")) return mobileProducts[2];
  if (relative === "uptime" || relative.startsWith("uptime/")) return mobileProducts[3];
  if (["tunnels", "requests", "subdomains", "domains"].some((section) => relative === section || relative.startsWith(`${section}/`))) return mobileProducts[0];
  return null;
}

export function mobileItemIsActive(item: MobileNavItem, pathname: string, orgSlug: string): boolean {
  const target = item.to.replace("/$orgSlug", `/${orgSlug}`);
  return pathname === target || (!item.exact && pathname.startsWith(`${target}/`));
}
