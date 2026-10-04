type FeatureFlag =
  "request_inspector" | "request_replay" | "full_capture" | "unified_sidebar";

const FLAGS: Record<FeatureFlag, boolean> = {
  request_inspector: true,
  request_replay: true,
  full_capture: true,
  unified_sidebar: true,
};

// Invalid or unset overrides keep the configured default.
export function resolveFeatureFlag(
  flag: FeatureFlag,
  override?: string,
): boolean {
  const value = override?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return FLAGS[flag] ?? false;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const override =
    flag === "unified_sidebar"
      ? import.meta.env?.VITE_UNIFIED_SIDEBAR
      : undefined;
  return resolveFeatureFlag(flag, override);
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  // Build-time config today; this can later be wired to remote configuration.
  return isFeatureEnabled(flag);
}
