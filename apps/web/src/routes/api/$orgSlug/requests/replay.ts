import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "../../../../lib/org";
import { validateUrl } from "../../../../lib/url-validator";

// Maximum allowed request body size (10MB)
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export const Route = createFileRoute("/api/$orgSlug/requests/replay")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const orgResult = await requireOrgFromSlug(request, params.orgSlug);
          if ("error" in orgResult) return orgResult.error;

          // Check Content-Length header to prevent DoS attacks
          const contentLength = request.headers.get("content-length");
          if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
            return Response.json(
              {
                error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB`,
              },
              { status: 413 },
            );
          }

          const body = await request.json();
          const { url, method, headers, requestBody } = body;

          if (!url || !method) {
            return Response.json(
              { error: "url and method are required" },
              { status: 400 },
            );
          }

          // Validate URL to prevent SSRF attacks
          const urlValidation = validateUrl(url);
          if (!urlValidation.valid) {
            return Response.json(
              { error: urlValidation.error || "Invalid URL" },
              { status: 400 },
            );
          }

          // Validate requestBody size to prevent memory exhaustion
          if (requestBody) {
            const bodySize =
              typeof requestBody === "string"
                ? Buffer.byteLength(requestBody, "utf8")
                : Buffer.byteLength(JSON.stringify(requestBody), "utf8");
            if (bodySize > MAX_BODY_SIZE) {
              return Response.json(
                {
                  error: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB`,
                },
                { status: 413 },
              );
            }
          }

          const startTime = Date.now();

          // Make the actual request with a timeout
          const controller = new AbortController();
          const timeoutMs = 10000;
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, timeoutMs);

          const response = await fetch(url, {
            method,
            headers: headers || {},
            body: ["GET", "HEAD"].includes(method) ? undefined : requestBody,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;

          // Get response headers
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          // Get response body
          let responseBody: string | null = null;
          try {
            responseBody = await response.text();
          } catch {
            responseBody = null;
          }

          return Response.json({
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            duration,
          });
        } catch (error) {
          console.error("Error replaying request:", error);
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to replay request",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
