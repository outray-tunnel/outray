import type { ResponseDetails } from "./types";
import {
  BodySection,
  HeaderSection,
  type PayloadCopyFeedback,
} from "./request-tab-content";

interface ResponseTabContentProps extends PayloadCopyFeedback {
  details: ResponseDetails;
  captured?: boolean;
}

export function ResponseTabContent({
  details,
  captured = true,
  ...copyFeedback
}: ResponseTabContentProps) {
  return (
    <div className="space-y-7" aria-label="Response payload">
      <HeaderSection
        headers={details.headers}
        captured={captured}
        copyLabel="Copy response headers"
        {...copyFeedback}
      />
      <BodySection
        body={details.body}
        captured={captured}
        size={details.bodySize}
        truncated={details.bodyTruncated}
        copyLabel="Copy response body"
        {...copyFeedback}
      />
    </div>
  );
}
