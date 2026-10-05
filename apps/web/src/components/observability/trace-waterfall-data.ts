import type { TraceSpan, TraceSummary } from "./traces-data";

interface WaterfallRow { span: TraceSpan; index: number; key: string; depth: number }

/** Parent-first, chronological siblings; orphaned or cyclic telemetry remains visible once. */
export function orderedTraceSpans(spans: readonly TraceSpan[]): WaterfallRow[] {
  const items = spans.map((span, index) => ({ span, index, key: JSON.stringify([span.id, index]), depth: 0 }));
  const byId = new Map<string, WaterfallRow>();
  for (const item of items) if (item.span.id && !byId.has(item.span.id)) byId.set(item.span.id, item);
  const children = new Map<WaterfallRow, WaterfallRow[]>();
  const roots: WaterfallRow[] = [];
  for (const item of items) {
    const parent = item.span.parentId ? byId.get(item.span.parentId) : undefined;
    if (parent && parent !== item) { const siblings = children.get(parent) ?? []; siblings.push(item); children.set(parent, siblings); }
    else roots.push(item);
  }
  const chronological = (left: WaterfallRow, right: WaterfallRow) => {
    const a = left.span.offset, b = right.span.offset;
    return Number.isFinite(a) && Number.isFinite(b) && a !== b ? a - b : left.index - right.index;
  };
  const result: WaterfallRow[] = [], visited = new Set<WaterfallRow>();
  const append = (initial: WaterfallRow) => {
    const pending = [{ item: initial, depth: 0 }];
    while (pending.length) {
      const { item, depth } = pending.pop()!;
      if (visited.has(item)) continue;
      visited.add(item); result.push({ ...item, depth });
      for (const child of [...(children.get(item) ?? [])].sort(chronological).reverse()) pending.push({ item: child, depth: depth + 1 });
    }
  };
  for (const item of roots.sort(chronological)) append(item);
  for (const item of items.sort(chronological)) append(item);
  return result;
}

export function traceTimelineDuration(trace: Pick<TraceSummary, "duration">, spans: readonly TraceSpan[]): number {
  const knownDuration = Number.isFinite(trace.duration) && trace.duration >= 0 ? trace.duration : 0;
  return spans.reduce((longest, span) => Number.isFinite(span.offset) && span.offset >= 0 && Number.isFinite(span.duration) && span.duration >= 0 && Number.isFinite(span.offset + span.duration) ? Math.max(longest, span.offset + span.duration) : longest, knownDuration);
}
