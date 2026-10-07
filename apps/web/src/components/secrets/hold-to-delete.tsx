import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "../arc/button/button";
import { createHoldToDeleteController } from "./hold-to-delete-controller";
import styles from "./hold-to-delete.module.css";

interface HoldToDeleteProps {
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  className?: string;
}

// These browser adapters are only called by a user gesture, never during SSR or
// render. Keeping them outside the component also leaves render deterministic.
const currentHoldTime = () => performance.now();
const scheduleHoldTick = (callback: () => void, delay: number) => window.setTimeout(callback, delay);
const cancelHoldTick = (handle: unknown) => window.clearTimeout(handle as number);

/** A click cannot confirm deletion. The same deliberate hold works with a
 * mouse, touch, or the keyboard; every interruption cancels its progress. */
export function HoldToDelete({ onConfirm, disabled = false, loading = false, label = "Hold to delete", className }: HoldToDeleteProps) {
  const id = useId();
  const [progress, setProgress] = useState(0);
  const latest = useRef({ onConfirm, disabled, loading });
  const mounted = useRef(true);
  const controller = useRef<ReturnType<typeof createHoldToDeleteController> | null>(null);
  useLayoutEffect(() => { latest.current = { onConfirm, disabled, loading }; }, [onConfirm, disabled, loading]);

  useLayoutEffect(() => {
    mounted.current = true;
    const hold = createHoldToDeleteController({
      now: currentHoldTime,
      schedule: scheduleHoldTick,
      cancelScheduled: cancelHoldTick,
      onProgress: (value) => { if (mounted.current) setProgress(value); },
      onConfirm: () => {
        const current = latest.current;
        if (mounted.current && !current.disabled && !current.loading) current.onConfirm();
      },
    });
    controller.current = hold;
    const cancelPointer = (event: globalThis.PointerEvent) => hold.cancel(`pointer:${event.pointerId}`);
    const cancelOnHide = () => { if (document.visibilityState !== "visible") hold.cancel(); };
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") hold.cancel(); };
    const cancelOnWindowBlur = () => hold.cancel();
    window.addEventListener("pointerup", cancelPointer);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("blur", cancelOnWindowBlur);
    window.addEventListener("keydown", cancelOnEscape);
    document.addEventListener("visibilitychange", cancelOnHide);
    return () => {
      mounted.current = false;
      hold.cancel();
      controller.current = null;
      window.removeEventListener("pointerup", cancelPointer);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("blur", cancelOnWindowBlur);
      window.removeEventListener("keydown", cancelOnEscape);
      document.removeEventListener("visibilitychange", cancelOnHide);
    };
  }, []);

  useLayoutEffect(() => { if (disabled || loading) controller.current!.cancel(); }, [disabled, loading]);

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || loading || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.currentTarget.focus();
    controller.current!.begin(`pointer:${event.pointerId}`);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    // Touch pointers are implicitly captured by browsers, so pointerleave alone
    // cannot detect a finger moving away from this button.
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      controller.current!.cancel(`pointer:${event.pointerId}`);
    }
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") { controller.current!.cancel(); return; }
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (disabled || loading || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    controller.current!.begin(`keyboard:${event.key}`);
  }

  function keyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    controller.current!.cancel(`keyboard:${event.key}`);
  }

  return (
    <div className={[styles.control, className].filter(Boolean).join(" ")}>
      <Button
        type="button" variant="danger" size="lg" className={styles.button}
        style={{ "--hold-progress": progress } as CSSProperties}
        disabled={disabled && !loading} loading={loading}
        aria-label={label} aria-describedby={`${id}-instructions`}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={(event) => controller.current!.cancel(`pointer:${event.pointerId}`)}
        onPointerCancel={(event) => controller.current!.cancel(`pointer:${event.pointerId}`)}
        onPointerLeave={(event) => controller.current!.cancel(`pointer:${event.pointerId}`)}
        onKeyDown={keyDown} onKeyUp={keyUp} onBlur={() => controller.current!.cancel()}
        onClick={(event) => event.preventDefault()} onContextMenu={(event) => event.preventDefault()}
      >
        <span className={styles.label}><Trash2 size={16} aria-hidden="true" />{label}</span>
      </Button>
      <span id={`${id}-instructions`} className={styles.hint}>
        <span aria-hidden="true">Hold for 5 seconds · Release to cancel</span>
        <span className={styles.screenReader}>Hold this button for 5 seconds to confirm. With a keyboard, hold Space or Enter. Release, move away, or press Escape to cancel.</span>
      </span>
      <span className={styles.screenReader} role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Deleting selected secrets." : progress >= 1 ? "Deletion requested." : progress > 0 ? "Keep holding. Release to cancel." : ""}
      </span>
    </div>
  );
}
