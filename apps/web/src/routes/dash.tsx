import {
  createFileRoute,
  Outlet,
  Link,
  useLocation,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  Network,
  Settings,
  Search,
  Bell,
  HelpCircle,
  Plus,
  History,
} from "lucide-react";

export const Route = createFileRoute("/dash")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const location = useLocation();
  const path = location.pathname.split("/").pop() || "overview";
  const title = path === "dash" ? "overview" : path;

  return (
    <div className="min-h-screen bg-[#0F1115] text-gray-300 font-sans selection:bg-blue-500/30">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/5 bg-[#0F1115] flex flex-col">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-black rounded-full" />
              </div>
              <span className="font-semibold text-white">OutRay</span>
            </div>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <div className="w-4 h-4 border border-current rounded-sm" />
            </button>
          </div>

          <div className="px-4 py-2">
            <button className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm text-gray-300 transition-colors group">
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/50" />
                Personal
              </span>
              <span className="text-gray-500 group-hover:text-gray-400">
                ▼
              </span>
            </button>
          </div>

          <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
            <div className="px-3 py-2">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-2.5 text-gray-500"
                  size={14}
                />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full bg-transparent border-none text-sm text-gray-300 placeholder-gray-500 pl-8 focus:ring-0"
                />
              </div>
            </div>

            <div className="mt-4 mb-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Platform
            </div>
            <NavItem
              to="/dash"
              icon={<LayoutDashboard size={16} />}
              label="Overview"
              activeOptions={{ exact: true }}
            />
            <NavItem
              to="/dash/tunnels"
              icon={<Network size={16} />}
              label="Tunnels"
            />
            <NavItem
              to="/dash/requests"
              icon={<History size={16} />}
              label="Requests"
            />

            <div className="mt-6 mb-2 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Configuration
            </div>
            <NavItem
              to="/dash/settings"
              icon={<Settings size={16} />}
              label="Settings"
            />
          </nav>

          <div className="p-4 border-t border-white/5 space-y-1">
            <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <HelpCircle size={16} />
              Help & Support
            </button>
            <div className="flex items-center gap-3 px-3 py-2 mt-2">
              <div className="w-8 h-8 rounded-full bg-linear-to-tr from-blue-500 to-purple-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  akinloluwami
                </div>
                <div className="text-xs text-gray-500 truncate">
                  Free Plan
                </div>
              </div>
              <button className="text-gray-400 hover:text-white">
                <Settings size={14} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0F1115]">
          <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0F1115]">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-white capitalize">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                Feedback
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                Docs
              </button>
              <div className="h-4 w-px bg-white/10 mx-1" />
              <button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors relative">
                <Bell size={18} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0F1115]" />
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20">
                <Plus size={16} />
                Create Tunnel
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
  activeOptions,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  activeOptions?: { exact: boolean };
}) {
  return (
    <Link
      to={to}
      activeProps={{
        className: "bg-white/5 text-white font-medium",
      }}
      inactiveProps={{
        className: "text-gray-400 hover:text-white hover:bg-white/5",
      }}
      activeOptions={activeOptions}
      className="flex items-center gap-3 w-full px-3 py-2 text-sm rounded-lg transition-all duration-200"
    >
      {icon}
      {label}
    </Link>
  );
}
