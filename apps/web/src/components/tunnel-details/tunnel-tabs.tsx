interface TunnelTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  protocol?: string;
}

export function TunnelTabs({
  activeTab,
  setActiveTab,
  protocol,
}: TunnelTabsProps) {
  const isProtocolTunnel = protocol === "tcp" || protocol === "udp";
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "requests", label: isProtocolTunnel ? "Events" : "Requests" },
  ];

  return (
    <div className="flex items-center border-b border-white/[0.07]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`border-b px-3 py-3 text-[11px] font-medium transition-colors ${
            activeTab === tab.id
              ? "border-accent text-zinc-200"
              : "border-transparent text-zinc-700 hover:text-zinc-400"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
