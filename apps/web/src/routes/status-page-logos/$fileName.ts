import { createFileRoute } from "@tanstack/react-router";
import { serveDiskStatusPageLogo } from "@/lib/uptime/status-logo-storage.server";

export const Route = createFileRoute("/status-page-logos/$fileName")({
  server: {
    handlers: {
      GET: ({ params }) => serveDiskStatusPageLogo(params.fileName),
      HEAD: ({ params }) => serveDiskStatusPageLogo(params.fileName, true),
    },
  },
});
