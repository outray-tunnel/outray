import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@outray/icons/stroke/ArrowLeft01Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import type { ReactNode } from "react";
import { Button } from "@/components/arc/button/button";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface AdminDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function AdminDataTable<T extends { id: string }>({
  columns,
  data,
  page,
  totalPages,
  onPageChange,
  isLoading,
  emptyMessage = "No data found",
}: AdminDataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#101010]">
      <div className="overflow-x-auto">
        <table className="w-full" aria-busy={isLoading || undefined}>
          <thead>
            <tr className="border-b border-white/[.06] bg-white/[.015]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-left text-xs font-medium text-zinc-500 ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[.06]">
            {isLoading && data.length === 0 ? (
              Array.from({ length: 5 }, (_, row) => (
                <tr key={`loading-${row}`}>
                  {columns.map((col, index) => (
                    <td key={col.key} className={`px-4 py-4 ${col.className || ""}`}>
                      {row === 0 && index === 0 ? <span className="sr-only">Loading records…</span> : null}
                      <div aria-hidden="true" className={`h-3.5 rounded bg-white/[.05] motion-safe:animate-pulse ${index === 0 ? "w-28" : "w-16"}`} />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-14 text-center text-[13px] text-zinc-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-white/[.025]"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-[13px] text-zinc-300 ${col.className || ""}`}
                    >
                      {col.render
                        ? col.render(item)
                        : cellValue(item, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-white/[.06] px-4 py-3">
          <span className="text-xs text-zinc-500" aria-live="polite">
            Page {page} of {totalPages}
          </span>
          <nav aria-label="Table pagination" className="flex gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={isLoading || page <= 1}
              aria-label="Previous page"
              className="w-8 min-w-8 px-0!"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={1.7} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={isLoading || page >= totalPages}
              aria-label="Next page"
              className="w-8 min-w-8 px-0!"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={1.7} aria-hidden="true" />
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}

function cellValue(item: object, key: string) {
  const value: unknown = Reflect.get(item, key);
  return value == null || value === "" ? "—" : String(value);
}
