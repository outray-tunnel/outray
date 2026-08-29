import type { ResponseDetails } from "./types";
import { JsonViewer, formatBody } from "./json-viewer";
import {
  CopyButton,
  DetailRow,
  InspectorSection,
} from "./request-tab-content";

interface ResponseTabContentProps {
  details: ResponseDetails;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}

export function ResponseTabContent({
  details,
  copiedField,
  onCopy,
}: ResponseTabContentProps) {
  const formatHeaderValue = (value: string | string[]): string => {
    return Array.isArray(value) ? value.join(", ") : value;
  };

  const bodyInfo = formatBody(details.body);

  return (
    <div className="space-y-7">
      <InspectorSection
        title="Headers"
        action={
          <CopyButton
            copied={copiedField === "res-headers"}
            onClick={() =>
              onCopy(
                JSON.stringify(details.headers, null, 2),
                "res-headers",
              )
            }
            label="Copy response headers"
          />
        }
      >
        {Object.entries(details.headers).map(([key, value]) => (
          <DetailRow
            key={key}
            label={key}
            value={formatHeaderValue(value)}
          />
        ))}
      </InspectorSection>

      {details.body && (
        <InspectorSection
          title="Body"
          titleAccessory={
            bodyInfo.isJson ? (
              <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-sky-400/70">
                JSON
              </span>
            ) : null
          }
          action={
            <CopyButton
              copied={copiedField === "res-body"}
              onClick={() =>
                onCopy(
                  bodyInfo.isJson ? bodyInfo.formatted : details.body!,
                  "res-body",
                )
              }
              label="Copy response body"
            />
          }
        >
          <div className="overflow-x-auto py-4">
            {bodyInfo.isJson ? (
              <JsonViewer data={bodyInfo.parsed} />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-zinc-400">
                {details.body}
              </pre>
            )}
          </div>
        </InspectorSection>
      )}
    </div>
  );
}
