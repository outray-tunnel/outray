import { useState } from "react";
import { Plug } from "lucide-react";
import { organizationInitials, organizationLogo } from "@/components/sidebar/organization-switcher-state";

export function ClientLogo({ name, className = "size-10" }: { name?: string | null; className?: string }) {
  if (name?.trim().toLowerCase() === "codex") {
    // Transparent Codex mark bundled with the desktop app (codex-app-ga-logo).
    return <img src="/logos/codex.png" alt="" aria-hidden="true" width={56} height={56} className={`${className} shrink-0 object-contain`} />;
  }
  return <span aria-hidden="true" className={`${className} grid shrink-0 place-items-center rounded-xl border border-white/[.09] bg-[#202020] text-zinc-400`}><Plug size={18} strokeWidth={1.7} /></span>;
}

export function OrganizationLogo({ name, logo: image, className = "size-9" }: { name: string; logo?: string | null; className?: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const logo = organizationLogo(image);
  return <span aria-hidden="true" className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[.08] bg-[#202020] text-xs font-medium text-zinc-300`}>
    {logo && failedImage !== logo
      ? <img src={logo} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailedImage(logo)} />
      : organizationInitials(name)}
  </span>;
}
