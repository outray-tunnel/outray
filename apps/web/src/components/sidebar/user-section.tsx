import { useNavigate } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Bug01Icon,
  Logout02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { ReportBugModal } from "../report-bug-modal";

interface UserSectionProps {
  user: any;
  isCollapsed: boolean;
}

export function UserSection({ user, isCollapsed }: UserSectionProps) {
  const navigate = useNavigate();
  const [isReportBugModalOpen, setIsReportBugModalOpen] = useState(false);

  const handleLogout = async () => {
    await authClient.signOut();
    navigate({ to: "/", search: { redirect: undefined } });
  };

  const initials = user?.name
    ?.split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  return (
    <div className={`${isCollapsed ? "px-2" : "px-3"} pb-3`}>
      <button
        type="button"
        onClick={() => setIsReportBugModalOpen(true)}
        className={`flex h-8 w-full items-center rounded-md text-[12px] text-zinc-600 transition-colors hover:bg-white/[0.045] hover:text-zinc-300 ${
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-2"
        }`}
        title={isCollapsed ? "Report a bug" : undefined}
      >
        <HugeiconsIcon
          icon={Bug01Icon}
          size={15}
          strokeWidth={1.7}
          aria-hidden="true"
        />
        {!isCollapsed && <span>Report a bug</span>}
      </button>

      <ReportBugModal
        isOpen={isReportBugModalOpen}
        onClose={() => setIsReportBugModalOpen(false)}
        userEmail={user?.email}
        userName={user?.name}
      />

      <div
        className={`mt-1 flex h-10 items-center rounded-md transition-colors hover:bg-white/[0.045] ${
          isCollapsed ? "justify-center" : "gap-2 px-1.5"
        }`}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-semibold text-zinc-200 ring-1 ring-white/10">
          {initials}
        </div>
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium leading-4 text-zinc-300">
                {user?.name || "User"}
              </p>
              <p className="truncate text-[10px] leading-3 text-zinc-600">
                {user?.email || "user@example.com"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded p-1 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              aria-label="Sign out"
              title="Sign out"
            >
              <HugeiconsIcon
                icon={Logout02Icon}
                size={14}
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
