import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import ArrowDown01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowDown01Icon";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationDropdownProps {
  organizations: Organization[];
  setSelectedOrganization: (org: Organization | null) => void;
  isOrgDropdownOpen: boolean;
  setIsOrgDropdownOpen: (open: boolean) => void;
  isCollapsed: boolean;
}

export function OrganizationDropdown({
  organizations,
  setSelectedOrganization,
  isOrgDropdownOpen,
  setIsOrgDropdownOpen,
  isCollapsed,
}: OrganizationDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { orgSlug } = useParams({ from: "/$orgSlug" });

  const selectedOrg =
    organizations.find((org) => org.slug === orgSlug) || organizations[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOrgDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsOrgDropdownOpen]);

  const initial = selectedOrg?.name?.charAt(0).toUpperCase() || "O";

  return (
    <div
      className={`relative ${isCollapsed ? "px-2" : "px-3"}`}
      ref={dropdownRef}
    >
      <button
        type="button"
        onClick={() =>
          !isCollapsed && setIsOrgDropdownOpen(!isOrgDropdownOpen)
        }
        className={`flex h-9 w-full items-center rounded-md text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white ${
          isCollapsed ? "justify-center px-1" : "gap-2 px-1.5"
        } ${isOrgDropdownOpen ? "bg-white/[0.06] text-white" : ""}`}
        aria-expanded={isOrgDropdownOpen}
        aria-label={isCollapsed ? selectedOrg?.name || "Organization" : undefined}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-white/10 bg-white/[0.07] text-[10px] font-semibold text-zinc-200">
          {initial}
        </span>
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium">
              {selectedOrg?.name || "Select organization"}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={13}
              strokeWidth={1.8}
              className={`text-zinc-600 transition-transform duration-150 ${
                isOrgDropdownOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {isOrgDropdownOpen && !isCollapsed && (
        <div className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#121212] p-1 shadow-2xl shadow-black/60">
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
            Organizations
          </p>
          <div className="max-h-56 overflow-y-auto">
            {organizations.map((org) => (
              <Link
                key={org.id}
                to={location.pathname.replace(/^\/[^/]+/, `/${org.slug}`)}
                onClick={() => {
                  setSelectedOrganization(org);
                  setIsOrgDropdownOpen(false);
                }}
                className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors ${
                  orgSlug === org.slug
                    ? "bg-white/[0.07] text-white"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {orgSlug === org.slug && (
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    size={14}
                    strokeWidth={1.8}
                    className="text-accent"
                    aria-hidden="true"
                  />
                )}
              </Link>
            ))}
          </div>
          <div className="mt-1 border-t border-white/[0.06] pt-1">
            <Link
              to="/onboarding"
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white"
              onClick={() => setIsOrgDropdownOpen(false)}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                size={14}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              Create organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
