"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** Trigger element; receives an onClick to toggle. */
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  widthClass?: string;
}

/**
 * A dropdown menu rendered in a portal so it is never clipped or z-trapped by
 * an ancestor's `overflow`/stacking context (e.g. the scrollable tab strip or a
 * card's rounded `overflow-hidden`). Closes on outside-click and Escape.
 */
export function Menu({ trigger, children, align = "right", widthClass = "w-52" }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const top = r.bottom + 6;
    setPos(
      align === "right"
        ? { top, right: window.innerWidth - r.right }
        : { top, left: r.left },
    );
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Move focus to the first item on open; restore it to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => {
      cancelAnimationFrame(id);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? items[(i + 1) % items.length]
        : e.key === "ArrowUp"
          ? items[(i - 1 + items.length) % items.length]
          : e.key === "Home"
            ? items[0]
            : items[items.length - 1];
    next.focus();
  };

  return (
    <div ref={triggerRef} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={menuRef}
                role="menu"
                aria-orientation="vertical"
                onKeyDown={onMenuKeyDown}
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.13 }}
                style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
                className={`z-[200] ${widthClass} overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-2xl ${
                  align === "right" ? "origin-top-right" : "origin-top-left"
                }`}
              >
                {children(() => setOpen(false))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  danger,
  icon,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-2 ${
        danger ? "text-danger hover:bg-danger/10" : "text-fg"
      }`}
    >
      {icon && <span className="flex-shrink-0 text-muted">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
    </button>
  );
}
