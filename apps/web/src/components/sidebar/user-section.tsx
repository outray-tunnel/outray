import { useNavigate } from "@tanstack/react-router";
import { Bug, LogOut } from "lucide-react";
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

  return (
    <div
      className={`${isCollapsed ? "p-2" : "p-3"} border-t border-white/5 space-y-2 bg-black/20`}
    >
      <button
        onClick={() => setIsReportBugModalOpen(true)}
        className={`flex items-center ${isCollapsed ? "justify-center w-10 h-10" : "gap-3 w-full px-3 py-2.5"} text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors group relative`}
      >
        <Bug size={20} />
        {!isCollapsed && <span>Report a Bug</span>}
        {isCollapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10">
            Report a Bug
          </div>
        )}
      </button>

      <ReportBugModal
        isOpen={isReportBugModalOpen}
        onClose={() => setIsReportBugModalOpen(false)}
        userEmail={user?.email}
        userName={user?.name}
      />

      <div
        className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"} ${isCollapsed ? "w-10 h-10" : "px-2 py-2"} rounded-xl hover:bg-white/5 transition-colors cursor-pointer group border border-transparent hover:border-white/5 relative`}
      >
        <div className="w-9 h-9 rounded-full bg-linear-to-tr from-accent to-orange-600 flex items-center justify-center text-black font-bold text-xs shadow-lg shadow-accent/20 shrink-0">
          {user?.name?.substring(0, 2).toUpperCase() || "U"}
        </div>
        {!isCollapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate group-hover:text-accent transition-colors">
                {user?.name || "User"}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {user?.email || "user@example.com"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <LogOut size={16} />
            </button>
          </>
        )}
        {isCollapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/10">
            {user?.name || "User"}
          </div>
        )}
      </div>
    </div>
  );
}
