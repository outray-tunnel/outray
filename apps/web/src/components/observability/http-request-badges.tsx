import type { RequestCaptureState } from "./http-requests-data";

export function HttpRequestStatusBadge({ code }: { code: number }) {
  const known = Number.isFinite(code) && code >= 100;
  const color = !known
    ? "border-white/[0.08] bg-white/[0.025] text-zinc-400"
    : code >= 500
      ? "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300"
      : code >= 400
        ? "border-amber-400/[0.12] bg-amber-400/[0.05] text-amber-300"
        : code >= 300
          ? "border-white/[0.08] bg-white/[0.025] text-zinc-300"
          : code < 200
            ? "border-sky-400/[0.12] bg-sky-400/[0.05] text-sky-300"
            : "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300";
  return <span className={`inline-flex min-h-6 w-fit min-w-[44px] shrink-0 items-center justify-self-start justify-center rounded-md border px-2 text-[11px] font-medium tabular-nums ${color}`}>{known ? code : "—"}</span>;
}

export function HttpRequestCaptureBadge({ state }: { state: RequestCaptureState }) {
  const presentation = {
    full: { label: "Captured", dot: "bg-emerald-400" },
    redacted: { label: "Redacted", dot: "bg-amber-400" },
    metadata: { label: "Metadata only", dot: "bg-zinc-500" },
  }[state];
  return (
    <span className="inline-flex min-h-6 w-fit shrink-0 items-center justify-self-start gap-1.5 whitespace-nowrap rounded-md border border-white/[0.06] bg-white/[0.025] px-2 text-[11px] text-zinc-400">
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${presentation.dot}`} />{presentation.label}
    </span>
  );
}
