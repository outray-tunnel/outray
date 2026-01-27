import { X, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { Button, Label, Select, IconButton } from "@/components/ui";

interface ChangeRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: "member" | "admin" | "owner";
  onConfirm: (role: "member" | "admin" | "owner") => void;
  isPending: boolean;
}

export function ChangeRoleModal({
  isOpen,
  onClose,
  currentRole,
  onConfirm,
  isPending,
}: ChangeRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<
    "member" | "admin" | "owner"
  >(currentRole);

  useEffect(() => {
    setSelectedRole(currentRole);
  }, [currentRole, isOpen]);

  if (!isOpen) return null;

  const roles = [
    {
      value: "member",
      label: "Member",
      description:
        "Can view and manage resources but cannot manage billing or members.",
    },
    {
      value: "admin",
      label: "Admin",
      description: "Can manage all resources, billing, and members.",
    },
    {
      value: "owner",
      label: "Owner",
      description:
        "Full access to everything including deleting the organization.",
    },
  ] as const;

  const selectedRoleData = roles.find((r) => r.value === selectedRole);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#101010] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">Change Member Role</h3>
          <IconButton
            onClick={onClose}
            icon={<X size={20} />}
            aria-label="Close"
          />
        </div>
        <div className="p-6 space-y-4">
          <div>
            <Label>Select Role</Label>
            <Select
              options={[...roles]}
              value={selectedRole}
              onChange={(value) =>
                setSelectedRole(value as "member" | "admin" | "owner")
              }
              icon={<Shield size={18} />}
            />
            <p className="mt-2 text-xs text-gray-500">
              {selectedRoleData?.description}
            </p>
          </div>
          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => onConfirm(selectedRole)}
              disabled={isPending}
              isLoading={isPending}
              className="flex-1"
            >
              {isPending ? "Updating..." : "Update Role"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
