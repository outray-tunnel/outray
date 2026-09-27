import { POSTHOG_CONFIG } from "./site";

export type OutrayAnalyticsEvent =
  | "navigation_clicked"
  | "cta_clicked"
  | "github_clicked"
  | "product_tab_changed"
  | "command_copied";

type AnalyticsProperty = boolean | number | string | null;

export interface OutrayTrackDetail {
  event: OutrayAnalyticsEvent;
  properties?: Record<string, AnalyticsProperty>;
}

const supportedEvents = new Set<OutrayAnalyticsEvent>([
  "navigation_clicked",
  "cta_clicked",
  "github_clicked",
  "product_tab_changed",
  "command_copied",
]);

let posthogPromise: Promise<typeof import("posthog-js").default | null> | undefined;

async function getPostHog() {
  if (!POSTHOG_CONFIG.key) return null;

  posthogPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_CONFIG.key!, {
        ...(POSTHOG_CONFIG.host ? { api_host: POSTHOG_CONFIG.host } : {}),
        autocapture: false,
        capture_pageleave: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
      });

      return posthog;
    })
    .catch(() => null);

  return posthogPromise;
}

async function capture(detail: OutrayTrackDetail) {
  if (!supportedEvents.has(detail.event)) return;

  const posthog = await getPostHog();
  posthog?.capture(detail.event, detail.properties);
}

export function startAnalytics(): () => void {
  if (!POSTHOG_CONFIG.enabled || typeof document === "undefined") {
    return () => undefined;
  }

  const onTrack = (event: Event) => {
    const detail = (event as CustomEvent<OutrayTrackDetail>).detail;
    if (!detail?.event) return;
    void capture(detail);
  };

  document.addEventListener("outray:track", onTrack);
  return () => document.removeEventListener("outray:track", onTrack);
}
