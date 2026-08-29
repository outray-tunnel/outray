import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import type { TunnelEvent, RequestDetails } from "./types";
import { JsonViewer, formatBody } from "./json-viewer";
import { getHttpMethodColor } from "./utils";

interface RequestTabContentProps {
  request: TunnelEvent;
  details: RequestDetails;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}

export function RequestTabContent({
  request,
  details,
  copiedField,
  onCopy,
}: RequestTabContentProps) {
  const formatHeaderValue = (value: string | string[]): string => {
    return Array.isArray(value) ? value.join(", ") : value;
  };

  const bodyInfo = formatBody(details.body);

  return (
    <div className="space-y-7">
      <InspectorSection title="General">
        <DetailRow
          label="URL"
          value={`${request.host.includes("localhost") ? "http" : "https"}://${request.host}${request.path}`}
        />
        <DetailRow
          label="Method"
          value={request.method}
          valueClassName={getHttpMethodColor(request.method)}
        />
        <DetailRow label="Client IP" value={request.client_ip} />
      </InspectorSection>

      <InspectorSection
        title="Headers"
        action={
          <CopyButton
            copied={copiedField === "req-headers"}
            onClick={() =>
              onCopy(
                JSON.stringify(details.headers, null, 2),
                "req-headers",
              )
            }
            label="Copy request headers"
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

      {Object.keys(details.queryParams).length > 0 && (
        <InspectorSection title="Query parameters">
          {Object.entries(details.queryParams).map(([key, value]) => (
            <DetailRow key={key} label={key} value={value} />
          ))}
        </InspectorSection>
      )}

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
              copied={copiedField === "req-body"}
              onClick={() =>
                onCopy(
                  bodyInfo.isJson ? bodyInfo.formatted : details.body!,
                  "req-body",
                )
              }
              label="Copy request body"
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

export function InspectorSection({
  title,
  titleAccessory,
  action,
  children,
}: {
  title: string;
  titleAccessory?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-y border-white/[0.07]">
      <div className="flex h-11 items-center justify-between border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            {title}
          </h3>
          {titleAccessory}
        </div>
        {action}
      </div>
      <div className="divide-y divide-white/[0.055]">{children}</div>
    </section>
  );
}

export function DetailRow({
  label,
  value,
  valueClassName = "text-zinc-400",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(90px,0.34fr)_1fr] gap-5 py-3">
      <span className="truncate font-mono text-[10px] text-zinc-700" title={label}>
        {label}
      </span>
      <span
        className={`break-all text-right font-mono text-[10px] leading-4 ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

export function CopyButton({
  copied,
  onClick,
  label,
}: {
  copied: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-zinc-700 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
      aria-label={label}
    >
      <HugeiconsIcon
        icon={copied ? Tick02Icon : Copy01Icon}
        size={13}
        strokeWidth={1.7}
        aria-hidden="true"
      />
    </button>
  );
}
