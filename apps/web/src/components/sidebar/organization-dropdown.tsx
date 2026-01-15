import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useRef, useEffect } from "react";
import { ChevronRight, Check, Plus } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationDropdownProps {
  organizations: any[];
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
    organizations?.find((org) => org.slug === orgSlug) || organizations?.[0];

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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setIsOrgDropdownOpen]);

  return (
    <div
      className={`${isCollapsed ? "px-2" : "px-4"} py-2 relative`}
      ref={dropdownRef}
    >
      <button
        onClick={() => !isCollapsed && setIsOrgDropdownOpen(!isOrgDropdownOpen)}
        className={`w-full flex items-center ${isCollapsed ? "justify-center" : "justify-between"} px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-sm text-gray-300 transition-all group hover:border-white/10 hover:shadow-lg hover:shadow-black/20 ${isOrgDropdownOpen ? "bg-white/10 border-white/10" : ""}`}
      >
        <span className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
            <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(255,166,43,0.5)]" />
          </div>
          {!isCollapsed && (
            <span className="font-medium truncate max-w-30">
              {selectedOrg?.name || "Select Org"}
            </span>
          )}
        </span>
        {!isCollapsed && (
          <span
            className={`text-gray-500 group-hover:text-gray-400 transition-transform duration-200 ${isOrgDropdownOpen ? "-rotate-90" : "rotate-90"}`}
          >
            <ChevronRight size={14} />
          </span>
        )}
      </button>

      {isOrgDropdownOpen && !isCollapsed && (
        <div className="absolute top-full left-4 right-4 mt-2 bg-[#101010] border border-white/10 rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50 backdrop-blur-xl">
          <div className="p-1 max-h-60 overflow-y-auto">
            {organizations.map((org) => (
              <Link
                key={org.id}
                to={location.pathname.replace(/^\/[^/]+/, `/${org.slug}`)}
                onClick={() => {
                  setSelectedOrganization(org);
                  setIsOrgDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  orgSlug === org.slug
                    ? "bg-accent/10 text-accent"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="truncate">{org.name}</span>
                {orgSlug === org.slug && <Check size={14} />}
              </Link>
            ))}
          </div>
          <div className="p-1 border-t border-white/5">
            <Link
              to="/onboarding"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              onClick={() => setIsOrgDropdownOpen(false)}
            >
              <Plus size={14} />
              Create Organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
