import ArrowDown01Icon from "@outray/icons/stroke/ArrowDown01Icon";
import Bug01Icon from "@outray/icons/stroke/Bug01Icon";
import Loading03Icon from "@outray/icons/stroke/Loading03Icon";
import Logout02Icon from "@outray/icons/stroke/Logout02Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  accountMenuFocusIndex,
  workspaceAccountIdentity,
  type WorkspaceAccountUser,
} from "./workspace-account-menu-state";

export interface WorkspaceAccountMenuProps {
  user?: WorkspaceAccountUser | null;
  onReportBug: () => void;
  onSignOut: () => Promise<void>;
  isPending?: boolean;
}

export function WorkspaceAccountMenu({
  user,
  onReportBug,
  onSignOut,
  isPending = false,
}: WorkspaceAccountMenuProps) {
  const instanceId = useId();
  const triggerId = `workspace-account-${instanceId}-trigger`;
  const menuId = `workspace-account-${instanceId}-menu`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLButtonElement>(null);
  const signOutRef = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const signOutInFlight = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const identity = workspaceAccountIdentity(user);
  const isBusy = isPending || isSigningOut;

  const enabledItems = useCallback(
    () =>
      [reportRef.current, signOutRef.current].filter(
        (item): item is HTMLButtonElement => !!item && !item.disabled,
      ),
    [],
  );

  const closeMenu = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const items = enabledItems();
    const item = initialFocus.current === "last" ? items.at(-1) : items[0];
    (item || menuRef.current)?.focus();

    const handleOutside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        closeMenu(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };

    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, enabledItems, closeMenu]);

  useEffect(() => {
    if (isOpen && isBusy) {
      (enabledItems()[0] || menuRef.current)?.focus();
    }
  }, [isBusy, isOpen, enabledItems]);

  const openMenu = (edge: "first" | "last") => {
    if (isPending) return;
    initialFocus.current = edge;
    if (isOpen) {
      const items = enabledItems();
      (edge === "last" ? items.at(-1) : items[0])?.focus();
    } else {
      setIsOpen(true);
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      // Let the browser move focus before removing the focused menu item.
      setTimeout(() => closeMenu(false), 0);
      return;
    }
    const items = enabledItems();
    const next = accountMenuFocusIndex(
      event.key,
      items.findIndex((item) => item === document.activeElement),
      items.length,
    );
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  };

  const handleSignOut = async () => {
    if (isPending || signOutInFlight.current) return;
    signOutInFlight.current = true;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await onSignOut();
      closeMenu(true);
    } catch {
      setSignOutError("Couldn’t sign out. Try again.");
    } finally {
      signOutInFlight.current = false;
      setIsSigningOut(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0 shrink-0">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={
          isPending ? "Loading account" : `Account menu for ${identity.name}`
        }
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-busy={isBusy}
        disabled={isPending}
        onClick={() => {
          if (isOpen) closeMenu(false);
          else openMenu("first");
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`flex h-10 min-h-10 max-w-[180px] items-center gap-2 rounded-lg px-1.5 text-zinc-400 transition-colors duration-150 md:h-8 md:min-h-8 md:max-w-[212px] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${
          isOpen
            ? "bg-white/[0.05] text-zinc-200"
            : "enabled:hover:bg-white/[0.035] enabled:hover:text-zinc-200"
        }`}
      >
        {isPending ? (
          <>
            <span
              aria-hidden="true"
              data-account-placeholder="avatar"
              className="size-6 shrink-0 animate-pulse rounded-full bg-white/[0.07] motion-reduce:animate-none"
            />
            <span
              aria-hidden="true"
              data-account-placeholder="name"
              className="h-3 w-20 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none"
            />
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.07] text-[10px] font-normal text-zinc-300 ring-1 ring-white/[0.08]"
            >
              {identity.image && failedImage !== identity.image ? (
                <img
                  src={identity.image}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setFailedImage(identity.image)}
                />
              ) : (
                identity.initials
              )}
            </span>
            <span className="min-w-0 max-w-[112px] truncate text-[12px] font-normal leading-4 tracking-[-0.01em] md:max-w-[144px]">
              {identity.name}
            </span>
          </>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={13}
          strokeWidth={1.7}
          className={`shrink-0 text-zinc-600 transition-transform duration-150 motion-reduce:transition-none ${isOpen ? "rotate-180" : "rotate-0"}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-60 max-w-[calc(100vw_-_24px)] rounded-xl border border-white/[0.09] bg-[#141415] p-1 shadow-xl shadow-black/40">
          <div className="mx-1 mb-1 border-b border-white/[0.07] px-1.5 pb-2.5 pt-2">
            <p className="truncate text-[12px] font-normal text-zinc-200">
              {identity.name}
            </p>
            {identity.email && (
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {identity.email}
              </p>
            )}
          </div>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            aria-busy={isBusy}
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            className="space-y-0.5 outline-none"
          >
            <button
              ref={reportRef}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={isPending}
              onClick={() => {
                closeMenu(true);
                onReportBug();
              }}
              className="flex h-10 min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-normal text-zinc-400 transition-colors duration-150 enabled:hover:bg-white/[0.045] enabled:hover:text-zinc-200 disabled:opacity-50 md:h-8 md:min-h-8 motion-reduce:transition-none focus-visible:bg-white/[0.06] focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              <HugeiconsIcon
                icon={Bug01Icon}
                size={15}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              Report a bug
            </button>
            <button
              ref={signOutRef}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={isBusy}
              onClick={() => void handleSignOut()}
              className="flex h-10 min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] font-normal text-zinc-400 transition-colors duration-150 enabled:hover:bg-white/[0.045] enabled:hover:text-zinc-200 disabled:opacity-60 md:h-8 md:min-h-8 motion-reduce:transition-none focus-visible:bg-white/[0.06] focus-visible:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              <HugeiconsIcon
                icon={isSigningOut ? Loading03Icon : Logout02Icon}
                size={15}
                strokeWidth={1.7}
                className={
                  isSigningOut
                    ? "animate-spin motion-reduce:animate-none"
                    : undefined
                }
                aria-hidden="true"
              />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
          {signOutError && (
            <p
              role="alert"
              className="mx-2.5 mb-2 mt-2 text-[11px] leading-4 text-rose-300"
            >
              {signOutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
