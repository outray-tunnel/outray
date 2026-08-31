/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import appCss from "../index.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { PostHogProvider } from "posthog-js/react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const Route = createRootRoute({
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
  return (
    <RootDocument>
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
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
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      </PostHogProvider>
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
