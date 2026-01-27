import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Network,
  LogOut,
  BarChart3,
  Wrench,
} from "lucide-react";

interface AdminSidebarProps {
  onLogout: () => void;
}

const navItems = [
  { path: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/organizations", label: "Organizations", icon: Building2 },
  { path: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { path: "/admin/tunnels", label: "Tunnels", icon: Network },
  { path: "/admin/charts", label: "Charts", icon: BarChart3 },
  { path: "/admin/actions", label: "Actions", icon: Wrench },
];

export function AdminSidebar({ onLogout }: AdminSidebarProps) {
  const location = useLocation();

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-64 h-screen bg-[#0A0A0A] border-r border-white/5 flex flex-col fixed left-0 top-0">
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="OutRay" className="w-8 h-8" />
          <div>
            <span className="font-bold text-white text-lg">OutRay</span>
            <span className="ml-2 text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">
              Admin
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path, item.exact);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={18} className={active ? "text-accent" : ""} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all w-full"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}
