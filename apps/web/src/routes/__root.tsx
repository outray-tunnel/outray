/// <reference types="vite/client" />
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { PostHogProvider } from "posthog-js/react";
import { authClient } from "@/lib/auth-client";
import { getPublicInstanceConfig } from "@/lib/instance";
import { InstanceContext } from "@/lib/instance-context";
import {
  bindQueryClientToSession,
  getQueryClientSnapshot,
  subscribeQueryClient,
} from "@/lib/query-client";

export const Route = createRootRoute({
  beforeLoad: async () => ({ instance: await getPublicInstanceConfig() }),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "OutRay - an open source alternative to ngrok",
      },
      {
        name: "description",
        content:
          "OutRay is an open-source tunneling solution that exposes localhost servers to the internet. Supports HTTP, TCP, and UDP protocols with custom domains and real-time analytics.",
      },
      {
        property: "og:title",
        content: "OutRay - an open source alternative to ngrok",
      },
      {
        property: "og:description",
        content:
          "OutRay is an open-source tunneling solution that exposes localhost servers to the internet. Supports HTTP, TCP, and UDP protocols with custom domains and real-time analytics.",
      },
      {
        property: "og:image",
        content: "https://outray.dev/og.png",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://outray.dev",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "OutRay - an open source alternative to ngrok",
      },
      {
        name: "twitter:description",
        content:
          "OutRay is an open-source tunneling solution that exposes localhost servers to the internet. Supports HTTP, TCP, and UDP protocols with custom domains and real-time analytics.",
      },
      {
        name: "twitter:image",
        content: "https://outray.dev/og.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { instance } = Route.useRouteContext();
  const [initialQueryClient] = useState(getQueryClientSnapshot);
  const queryClient = useSyncExternalStore(
    subscribeQueryClient,
    getQueryClientSnapshot,
    () => initialQueryClient,
  );
  useEffect(
    () => bindQueryClientToSession(authClient.$store.atoms.session),
    [],
  );
  return (
    <RootDocument>
      <InstanceContext.Provider value={instance}>
      <PostHogProvider
        apiKey={instance.selfHosted ? "" : import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={{
          api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          defaults: "2025-05-24",
          capture_exceptions: true,
          debug: import.meta.env.MODE === "development",
          autocapture: {
            url_ignorelist: [/\/[^/]+\/secrets(?:\/|$)/],
          },
          session_recording: {
            blockSelector: ".ph-no-capture",
            maskAllInputs: true,
            recordHeaders: false,
            recordBody: false,
            maskCapturedNetworkRequestFn: (request) =>
              /\/api\/[^/]+\/secrets(?:\/|$)/.test(request.name)
                ? null
                : request,
          },
        }}
      >
        <QueryClientProvider key={queryClient.generation} client={queryClient.client}>
          <Outlet />
        </QueryClientProvider>
      </PostHogProvider>
      </InstanceContext.Provider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <RootProvider>{children}</RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
