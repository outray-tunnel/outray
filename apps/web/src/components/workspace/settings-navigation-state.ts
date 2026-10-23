export type SettingsNavigationItem = { label: string; href: string };

export const personalSettingsItems: readonly SettingsNavigationItem[] = [
  { label: "General", href: "/account/settings" },
  { label: "Connected apps", href: "/account/settings/connected-apps" },
];

export function organizationSettingsItems(orgSlug: string, billing: boolean): SettingsNavigationItem[] {
  const base = `/${encodeURIComponent(orgSlug)}`;
  return [
    { label: "General", href: `${base}/settings/organization` },
    { label: "Members", href: `${base}/members` },
    { label: "API tokens", href: `${base}/tokens` },
    ...(billing ? [{ label: "Billing", href: `${base}/billing` }] : []),
  ];
}

export function settingsItemIsActive(item: SettingsNavigationItem, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path === item.href || (item.label !== "General" && path.startsWith(`${item.href}/`));
}

export function isOrganizationSettingsPath(pathname: string, orgSlug: string): boolean {
  const base = `/${encodeURIComponent(orgSlug)}`;
  return ["settings", "members", "tokens", "billing"].some((section) => pathname === `${base}/${section}` || pathname.startsWith(`${base}/${section}/`));
}
