import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";

export const Route = createFileRoute("/api/admin/proxy-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const imageUrl = url.searchParams.get("url");

        if (!imageUrl) {
          return adminJson({ error: "Missing url parameter" }, { status: 400 });
        }

        // Only allow images from our assets domain
        if (!imageUrl.startsWith("https://assets.outray.dev/")) {
          return adminJson({ error: "Invalid image URL" }, { status: 403 });
        }

        try {
          const response = await fetch(imageUrl);
          
          if (!response.ok) {
            return adminJson({ error: "Failed to fetch image" }, { status: response.status });
          }

          const contentType = response.headers.get("content-type") || "image/jpeg";
          const buffer = await response.arrayBuffer();

          return new Response(buffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, no-store",
            },
          });
        } catch (error) {
          console.error("Image proxy error:", error);
          return adminJson({ error: "Failed to proxy image" }, { status: 500 });
        }
      },
    },
  },
});
