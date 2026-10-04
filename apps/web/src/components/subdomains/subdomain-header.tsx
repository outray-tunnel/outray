import type { Ref } from "react";
import { AddressPageHeader } from "@/components/tunnel-addresses/address-page";

interface SubdomainHeaderProps {
  currentSubdomainCount: number;
  subdomainLimit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isReady?: boolean;
  onAddClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function SubdomainHeader({
  currentSubdomainCount,
  subdomainLimit,
  isUnlimited,
  isAtLimit,
  isReady,
  onAddClick,
  buttonRef,
}: SubdomainHeaderProps) {
  return (
    <AddressPageHeader
      title="Subdomains"
      description="Reserve an OutRay address and reuse it across tunnel connections."
      action="Reserve subdomain"
      count={currentSubdomainCount}
      limit={subdomainLimit}
      isUnlimited={isUnlimited}
      isAtLimit={isAtLimit}
      isReady={isReady}
      onAddClick={onAddClick}
      buttonRef={buttonRef}
    />
  );
}
