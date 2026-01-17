import { X, Mail, Shield, Loader2, Check, ChevronDown } from "lucide-react";
import { useRef, useState, useEffect } from "react";

type Role = "member" | "admin" | "owner";

interface InviteMemberModalProps {
  setIsInviteModalOpen: (isOpen: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: Role;
  setInviteRole: (role: Role) => void;
  inviteMutation: {
    isPending: boolean;
  };
  handleInvite: (e: React.FormEvent) => void;
}

const roles = [
  {
    value: "member",
    label: "Member",
    description: "Can view and contribute to projects",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Can manage members and settings",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full access to all features and settings",
  },
];

export default function InviteMemberModal({
  setIsInviteModalOpen,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteMutation,
  handleInvite,
}: InviteMemberModalProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedRole = roles.find((r) => r.value === inviteRole);

  // Close dropdown when clicking outside the options
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#101010] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-center justify-between rounded-t-2xl bg-[#101010]">
          <h3 className="text-xl font-bold text-white">Invite Member</h3>
          <button
            onClick={() => setIsInviteModalOpen(false)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleInvite} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                size={18}
              />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
                placeholder="colleague@example.com"
              />
            </div>
          </div>

          {/* Custom Role Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Role
            </label>
            <div className="relative" ref={dropdownRef}>
              <Shield
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
                size={18}
              />

              {/* Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-white text-left focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all cursor-pointer"
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
                aria-labelledby="role-label"
                aria-controls="role-listbox"
              >
                {selectedRole?.label}
              </button>

              <ChevronDown
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                size={18}
              />

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-20 w-full mt-2 bg-[#101010] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                  {roles.map((roleOption) => (
                    <button
                      key={roleOption.value}
                      type="button"
                      onClick={() => {
                        setInviteRole(roleOption.value as Role);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left hover:bg-accent/5 transition-colors flex items-center justify-between group ${inviteRole === roleOption.value ? "bg-accent/10 hover:bg-accent/10" : ""}`}
                    >
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {roleOption.label}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {roleOption.description}
                        </div>
                      </div>
                      {inviteRole === roleOption.value && (
                        <Check size={18} className="text-accent ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-2 text-xs text-gray-400">
              {selectedRole?.description}
            </p>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setIsInviteModalOpen(false)}
              className="flex-1 px-4 py-2.5 bg-white/5 text-white rounded-xl font-medium hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="flex-1 px-4 py-2.5 bg-white text-black rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
