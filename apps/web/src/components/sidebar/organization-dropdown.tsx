import { useLocation, useParams } from "@tanstack/react-router";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { HugeiconsIcon } from "@hugeicons/react";
import UnfoldMoreIcon from "@outray/icons/stroke/UnfoldMoreIcon";
import { OrganizationAvatar, OrganizationSwitcherContent } from "./organization-switcher-content";
import type { SwitcherOrganization } from "./organization-switcher-state";
import styles from "./organization-switcher.module.css";

export interface OrganizationDropdownProps {
  organizations: SwitcherOrganization[];
  setSelectedOrganization: (organization: SwitcherOrganization | null) => void;
  isOrgDropdownOpen: boolean;
  setIsOrgDropdownOpen: (open: boolean) => void;
  isCollapsed: boolean;
  isLoading?: boolean;
}

export function OrganizationDropdown({ organizations, setSelectedOrganization, isOrgDropdownOpen, setIsOrgDropdownOpen, isCollapsed, isLoading = false }: OrganizationDropdownProps) {
  const location = useLocation();
  const { orgSlug } = useParams({ from: "/$orgSlug" });
  const selectedOrg = organizations.find((organization) => organization.slug === orgSlug);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const initialFocus = useRef<"search" | "first" | "last">("search");

  const options = () => Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("[data-org-option]") ?? []);
  const openChanged = (open: boolean) => {
    if (open && isLoading) return;
    setQuery("");
    setIsOrgDropdownOpen(open);
  };
  const plainClick = (event: MouseEvent<HTMLAnchorElement>) => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  const select = (organization: SwitcherOrganization, event: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(event)) return;
    if (organization.slug === orgSlug) event.preventDefault();
    else setSelectedOrganization(organization);
    openChanged(false);
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      (event.key === "ArrowUp" ? options().at(-1) : options()[0])?.focus();
    } else if (event.key === "Enter" && query.trim()) {
      event.preventDefault();
      options()[0]?.click();
    }
  };
  const listKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = options();
    const index = items.findIndex((item) => item === document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault(); items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) (searchRef.current || items.at(-1))?.focus();
      else items[index - 1]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); (event.key === "End" ? items.at(-1) : items[0])?.focus();
    }
  };

  return <div className={styles.root} data-collapsed={isCollapsed}>
    <Popover.Root open={isOrgDropdownOpen && !isLoading} onOpenChange={openChanged}>
      <Popover.Trigger asChild>
        <button type="button" className={styles.trigger} disabled={isLoading} aria-label={isLoading ? "Loading organizations" : `Switch organization${selectedOrg ? `, ${selectedOrg.name}` : ""}`} aria-busy={isLoading || undefined} title={isCollapsed ? selectedOrg?.name || "Switch organization" : undefined}
          onClick={() => { initialFocus.current = "search"; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
              if (isOrgDropdownOpen) (event.key === "ArrowUp" ? options().at(-1) : options()[0] || searchRef.current)?.focus();
              else openChanged(true);
            }
          }}>
          {isLoading ? <><span className={styles.placeholderAvatar} aria-hidden="true" />{!isCollapsed && <span className={styles.placeholderName} aria-hidden="true" />}</> : <>
            <OrganizationAvatar organization={selectedOrg} />
            {!isCollapsed && <><span className={styles.identity}><span className={styles.name}>{selectedOrg?.name || "Select organization"}</span></span><HugeiconsIcon icon={UnfoldMoreIcon} size={14} strokeWidth={1.7} className={styles.arrows} aria-hidden="true" /></>}
          </>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.panel} aria-label="Switch organization" side={isCollapsed ? "right" : "bottom"} align="start" sideOffset={8} collisionPadding={12} onOpenAutoFocus={(event) => {
          const target = initialFocus.current === "last" ? options().at(-1) || searchRef.current
            : initialFocus.current === "first" ? options()[0] || searchRef.current
            : searchRef.current || options()[0];
          if (target) { event.preventDefault(); target.focus(); }
        }}>
          <OrganizationSwitcherContent organizations={organizations} orgSlug={orgSlug} pathname={location.pathname} query={query} onQueryChange={setQuery} onSelect={select} onCreate={(event) => { if (plainClick(event)) openChanged(false); }} onSearchKeyDown={searchKeyDown} onListKeyDown={listKeyDown} searchRef={searchRef} listRef={listRef} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>;
}
