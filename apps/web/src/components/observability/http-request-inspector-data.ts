import { normalizeHttpMethod } from "@/lib/observability/http-method";
import type {
  HttpRequestDetails,
  RequestDetailsResponse,
} from "./http-requests-data";

/** Detail fetch is scoped to the selected organization and cancelled with its drawer. */
export async function fetchHttpRequestDetails(
  orgSlug: string,
  requestId: string,
  signal: AbortSignal,
): Promise<RequestDetailsResponse> {
  const response = await fetch(
    `/api/${encodeURIComponent(orgSlug)}/observability/requests/${encodeURIComponent(requestId)}`,
    { signal },
  );
  if (!response.ok) throw new Error("Could not load request details");
  return (await response.json()) as RequestDetailsResponse;
}

export function generateHttpRequestCurl(request: HttpRequestDetails) {
  const method = normalizeHttpMethod(request.method);
  const headers = Object.entries(request.request.headers)
    .filter(
      ([, value]) =>
        request.request.headersCaptured && !containsHttpRequestRedaction(value),
    )
    .map(([key, value]) => `  -H '${shellEscape(`${key}: ${value}`)}'`)
    .join(" \\\n");
  const body =
    request.request.bodyCaptured && request.request.body
      ? ` \\\n  --data '${shellEscape(request.request.body)}'`
      : "";
  const url = request.url || request.path || "/";
  return `curl -X '${shellEscape(method)}' '${shellEscape(url)}'${headers ? ` \\\n${headers}` : ""}${body}`;
}

function shellEscape(value: string) {
  return value.replaceAll("'", "'\\''");
}

export function containsHttpRequestRedaction(value: string) {
  return /\[redacted\]|%5bredacted%5d/i.test(value);
}
