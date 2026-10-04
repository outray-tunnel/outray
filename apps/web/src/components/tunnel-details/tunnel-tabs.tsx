import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import "../outray-arc-theme.css";

interface TunnelTabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  protocol?: string;
  children?: ReactNode;
}

export function TunnelTabs({
  activeTab,
  setActiveTab,
  protocol,
  children,
}: TunnelTabsProps) {
  const isProtocolTunnel = protocol === "tcp" || protocol === "udp";
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "requests", label: isProtocolTunnel ? "Events" : "Requests" },
  ];

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      activationMode="automatic"
      className="outray-arc outray-arc-tunnel-tabs"
    >
      <TabsList aria-label="Tunnel views" data-outray-tabs-list>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} data-outray-tabs-trigger>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
