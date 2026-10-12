"use client";
import { forwardRef, useId, useRef } from "react";
import type { ChangeEvent, InputHTMLAttributes } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, X as Xmark } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import { WorkspaceInput } from "../../ui/workspace-input";
import { workspaceInputShellClassName } from "../../ui/workspace-input-styles";
export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> { label: string; value: string; onValueChange: (value: string) => void; appearance?: "default" | "workspace" }
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({ label, value, onValueChange, id, className, appearance = "default", ...props }, ref) {
  const generated = useId(); const controlId = id ?? generated; const reduced = useReducedMotion(); const inputRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (node: HTMLInputElement | null) => { inputRef.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; };
  // Clearing returns focus to the field, since the clear button unmounts under the pointer.
  function clear() { onValueChange(""); inputRef.current?.focus(); }
  const inputProps = { ...props, ref: setRefs, id: controlId, type: "search", value, onChange: (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value) };
  return <div className="grid min-w-0 gap-2 [&>label]:text-[13px] [&>label]:leading-[1.45] [&>label]:font-medium [&>label]:tracking-[-.01em]"><label htmlFor={controlId}>{label}</label><div className={`group flex min-h-9 items-center gap-2 rounded-xl border border-white/20 bg-zinc-900 px-3 transition-colors duration-160 ease-out hover:not-focus-within:border-zinc-50 focus-within:border-zinc-50 motion-reduce:transition-none ${appearance === "workspace" ? workspaceInputShellClassName : ""}`} data-field-size={appearance === "workspace" ? "compact" : undefined} data-filled={value ? "true" : undefined}>
    <Search className="shrink-0 text-zinc-500 transition-colors duration-160 group-focus-within:text-zinc-50 group-data-[filled=true]:text-zinc-50 motion-reduce:transition-none" width={18} height={18} aria-hidden="true"/>{appearance === "workspace" ? <WorkspaceInput {...inputProps} variant="bare" size="compact" className={className} /> : <input {...inputProps} className={["w-full min-w-0 border-0 bg-transparent text-[13px] tracking-[-.01em] text-zinc-50 outline-0 placeholder:text-zinc-500 focus-visible:outline-0 [&::-webkit-search-cancel-button]:hidden", className].filter(Boolean).join(" ")} />}
    {/* The clear button has a reserved slot, so the field never changes width when it appears or leaves. */}
    <span className="grid size-6 shrink-0 place-items-center"><AnimatePresence initial={false}>{value ? <motion.button className="grid size-6 place-items-center rounded-xl border-0 bg-transparent text-zinc-500 transition-colors duration-160 hover:bg-[#202023] hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] motion-reduce:transition-none" key="clear" type="button" tabIndex={0} onClick={clear} aria-label="Clear search" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: .8, filter: `blur(${motionTokens.blur.subtle}px)` }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: .8, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }} whileTap={reduced ? undefined : { scale: .96, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }} transition={reduced ? { duration: motionTokens.duration.instant } : { ...motionTokens.spring.snappy, opacity: { duration: motionTokens.duration.fast }, filter: { duration: motionTokens.duration.fast } }}><Xmark width={16} height={16} aria-hidden="true" /></motion.button> : null}</AnimatePresence></span>
  </div></div>;
});
