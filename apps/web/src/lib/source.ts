import { docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";
import { SiVite, SiNextdotjs } from "react-icons/si";
import { TbBuildingTunnel } from "react-icons/tb";
import { LuSquareTerminal } from "react-icons/lu";

// Custom icons from react-icons
const customIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  SiVite,
  SiNextdotjs,
  TbBuildingTunnel,
  LuSquareTerminal,
};

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) {
      // You may set a default icon
      return;
    }
    // Check custom icons first
    if (icon in customIcons) return createElement(customIcons[icon]);
    // Fall back to Lucide icons
    if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
});
