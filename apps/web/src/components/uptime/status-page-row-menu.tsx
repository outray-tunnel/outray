import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "../arc/button/button";

export interface StatusPageMenuItem { label: string; action: () => void; danger?: boolean; disabled?: boolean }

export function StatusPageRowMenu({ label, items, disabled }: { label: string; items: StatusPageMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initial = useRef<"first" | "last">("first");
  const id = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const buttons = menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    (initial.current === "last" ? buttons?.item(buttons.length - 1) : buttons?.item(0))?.focus();
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Tab") { close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return <div ref={root} className="relative shrink-0">
    <Button ref={trigger} type="button" variant="ghost" size="sm" className="!size-8 !min-h-8 !px-0" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => { initial.current = "first"; setOpen((value) => !value); }} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); initial.current = event.key === "ArrowUp" ? "last" : "first"; setOpen(true); } }}><MoreHorizontal size={16} aria-hidden="true" /></Button>
    {open && <div ref={menu} id={id} role="menu" aria-label={label} onKeyDown={keyboard} className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-xl border border-white/[0.1] bg-[#19191b] p-1 shadow-xl">
      {items.map((item) => <button type="button" role="menuitem" key={item.label} disabled={item.disabled} onClick={() => { close(); item.action(); }} className={`flex min-h-9 w-full items-center rounded-lg px-3 text-left text-[12px] transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none ${item.danger ? "text-rose-400" : "text-zinc-300"}`}>{item.label}</button>)}
    </div>}
  </div>;
}
