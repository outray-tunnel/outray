import type { Ref } from "react";
import { AddressPageHeader } from "@/components/tunnel-addresses/address-page";

interface DomainHeaderProps {
  currentDomainCount: number;
  domainLimit: number;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isReady?: boolean;
  onAddClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function DomainHeader({
  currentDomainCount,
  domainLimit,
  isUnlimited,
  isAtLimit,
  isReady,
  onAddClick,
  buttonRef,
}: DomainHeaderProps) {
  return (
    <AddressPageHeader
      title="Custom domains"
      description="Use your own domain for a familiar, branded tunnel address."
      action="Add domain"
      count={currentDomainCount}
      limit={domainLimit}
      isUnlimited={isUnlimited}
      isAtLimit={isAtLimit}
      isReady={isReady}
      onAddClick={onAddClick}
      buttonRef={buttonRef}
    />
  );
}
