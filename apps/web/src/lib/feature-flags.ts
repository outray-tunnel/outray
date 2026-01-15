type FeatureFlag = "request_inspector" | "request_replay" | "full_capture";

const FLAGS: Record<FeatureFlag, boolean> = {
  request_inspector: false,
  request_replay: false,
  full_capture: false,
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] ?? false;
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  // For now, just return the static value
  // Later this can be wired up to a remote config or user/org settings
  return isFeatureEnabled(flag);
}
