import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

/** Keep native checkbox semantics while using the dashboard's quiet control surface. */
export function AlertSelectionControl(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">,
) {
  return (
    <span className="relative inline-flex size-4 shrink-0">
      <input {...props} type="checkbox" className="peer sr-only" />
      <span
        aria-hidden="true"
        className="flex size-4 items-center justify-center rounded-[4px] border border-white/20 bg-white/[0.025] text-transparent transition-colors peer-checked:border-zinc-200 peer-checked:bg-zinc-200 peer-checked:text-zinc-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent peer-disabled:opacity-40 motion-reduce:transition-none"
      >
        <Check size={11} strokeWidth={2.5} />
      </span>
    </span>
  );
}
