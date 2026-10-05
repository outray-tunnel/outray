import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { TunnelEvent, RequestDetails } from "./types";
import { JsonViewer, formatBody } from "./json-viewer";
import { formatBytes } from "./utils";

export interface PayloadCopyFeedback {
  onCopyError?: () => void;
  onCopied?: () => void;
}

interface RequestTabContentProps extends PayloadCopyFeedback {
  request: TunnelEvent;
  details: RequestDetails;
  /** False for metadata fallback; an unavailable header set is not an empty capture. */
  captured?: boolean;
}

export function RequestTabContent({
  request: _request,
  details,
  captured = true,
  ...copyFeedback
}: RequestTabContentProps) {
  const queryEntries =
    details.queryEntries ?? Object.entries(details.queryParams);
  return (
    <div className="space-y-7" aria-label="Request payload">
      {queryEntries.length > 0 && (
        <InspectorSection
          title="Query parameters"
          titleAccessory={
            <SectionCount count={queryEntries.length} singular="parameter" />
          }
        >
          <dl className="divide-y divide-white/[0.06]">
            {queryEntries.map(([key, value], index) => (
              <DetailRow key={`${key}:${index}`} label={key} value={value} />
            ))}
          </dl>
        </InspectorSection>
      )}
      <HeaderSection
        headers={details.headers}
        captured={captured}
        copyLabel="Copy request headers"
        {...copyFeedback}
      />
      <BodySection
        body={details.body}
        captured={captured}
        size={details.bodySize}
        truncated={details.bodyTruncated}
        copyLabel="Copy request body"
        {...copyFeedback}
      />
    </div>
  );
}

export function HeaderSection({
  headers,
  captured = true,
  copyLabel,
  ...copyFeedback
}: PayloadCopyFeedback & {
  headers: Record<string, string | string[]> | null;
  captured?: boolean;
  copyLabel: string;
}) {
  const available = captured && headers !== null;
  const entries = available ? Object.entries(headers) : [];
  return (
    <InspectorSection
      title="Headers"
      titleAccessory={
        available ? (
          <SectionCount count={entries.length} singular="header" />
        ) : undefined
      }
      action={
        entries.length > 0 ? (
          <CopyButton
            value={JSON.stringify(headers, null, 2)}
            label={copyLabel}
            iconOnly
            variant="plain"
            {...copyFeedback}
          />
        ) : undefined
      }
    >
      {!available ? (
        <PayloadNotice title="Headers unavailable">
          Detailed headers were not captured for this request.
        </PayloadNotice>
      ) : entries.length === 0 ? (
        <PayloadNotice title="No headers">
          The captured header set is empty.
        </PayloadNotice>
      ) : (
        <dl className="divide-y divide-white/[0.06]">
          {entries.map(([key, value]) => (
            <DetailRow key={key} label={key} value={value} />
          ))}
        </dl>
      )}
    </InspectorSection>
  );
}

const bodyModes = [
  { value: "pretty", label: "Pretty" },
  { value: "raw", label: "Raw" },
] as const;

export function BodySection({
  body,
  captured = true,
  size,
  truncated,
  copyLabel,
  ...copyFeedback
}: PayloadCopyFeedback & {
  body: string | null;
  captured?: boolean;
  size?: number;
  truncated?: boolean;
  copyLabel: string;
}) {
  const [mode, setMode] = useState<"pretty" | "raw">("pretty");
  const bodyInfo = formatBody(body);
  const unavailable =
    !captured || (body === null && typeof size === "number" && size > 0);
  const empty = !unavailable && (body === null || body === "");
  const showBody = !unavailable && !empty;
  const knownSize =
    typeof size === "number" && Number.isFinite(size) && size >= 0;
  const copyValue =
    mode === "pretty" && bodyInfo.isJson ? bodyInfo.formatted : (body ?? "");
  return (
    <InspectorSection
      title="Body"
      titleAccessory={
        captured && knownSize ? (
          <span className="text-[12px] text-zinc-400">{formatBytes(size)}</span>
        ) : undefined
      }
      action={
        showBody ? (
          <div className="flex items-center gap-2">
            {bodyInfo.isJson && (
              <SegmentedControl
                options={bodyModes}
                value={mode}
                onValueChange={setMode}
                label="Body format"
                className="[&_button]:h-6 [&_button]:text-[11px]"
              />
            )}
            <CopyButton
              value={copyValue}
              label={copyLabel}
              iconOnly
              variant="plain"
              {...copyFeedback}
            />
          </div>
        ) : undefined
      }
    >
      {truncated === true && (
        <p
          className="mb-3 flex items-start gap-2 text-[12px] leading-5 text-amber-200"
          role="note"
        >
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          This body was truncated during capture. Only the stored portion is
          shown.
        </p>
      )}
      {unavailable ? (
        <PayloadNotice title="Body unavailable">
          Body content was not captured for this request.
        </PayloadNotice>
      ) : empty ? (
        <PayloadNotice title="Empty body">
          The captured payload did not contain a body.
        </PayloadNotice>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/15 p-3.5">
          {bodyInfo.isJson && mode === "pretty" ? (
            <JsonViewer data={bodyInfo.parsed} />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12px] leading-5 text-zinc-300 [overflow-wrap:anywhere]">
              {body}
            </pre>
          )}
        </div>
      )}
    </InspectorSection>
  );
}

function SectionCount({
  count,
  singular,
}: {
  count: number;
  singular: string;
}) {
  return (
    <span className="text-[12px] text-zinc-400">
      {count} {singular}
      {count === 1 ? "" : "s"}
    </span>
  );
}

export function PayloadNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-3">
      <p className="text-[13px] text-zinc-300">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-zinc-400">{children}</p>
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
  const id = useId();
  return (
    <section className="min-w-0" aria-labelledby={id}>
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 id={id} className="text-[13px] font-medium text-zinc-200">
            {title}
          </h3>
          {titleAccessory}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailRow({
  label,
  value,
  valueClassName = "text-zinc-300",
}: {
  label: string;
  value: string | string[];
  valueClassName?: string;
}) {
  const values = Array.isArray(value) ? value : [value];
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1.5 py-3 sm:grid-cols-[minmax(100px,0.38fr)_1fr] sm:gap-5">
      <dt className="min-w-0 font-mono text-[12px] leading-5 text-zinc-400 [overflow-wrap:anywhere]">
        {label}
      </dt>
      <dd
        className={`min-w-0 space-y-1 font-mono text-[12px] leading-5 [overflow-wrap:anywhere] ${valueClassName}`}
      >
        {values.length === 0 ? (
          <span className="text-zinc-400">Empty</span>
        ) : (
          values.map((item, index) => (
            <div key={index}>
              {item === "" ? (
                <span className="text-zinc-400">Empty</span>
              ) : (
                item
              )}
            </div>
          ))
        )}
      </dd>
    </div>
  );
}
