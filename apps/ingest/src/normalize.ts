import { Buffer } from "node:buffer";

/** Bound shared OTLP resource amplification identically for Node and Workers. */
export function normalizeWithinBudget<T, R>(
  items: readonly T[],
  convert: (item: T) => R,
  budget = 16 * 1024 * 1024,
) {
  const rows: R[] = [];
  let bytes = 0;
  for (const item of items) {
    const row = convert(item);
    const size = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (bytes + size > budget) break;
    bytes += size;
    rows.push(row);
  }
  return { rows, rejected: items.length - rows.length };
}
