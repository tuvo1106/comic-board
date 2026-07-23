"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { lockScroll, unlockScroll } from "@/lib/scroll-lock";
import { useMounted } from "@/lib/use-mounted";
import { X } from "./icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Max width class, e.g. "max-w-md". */
  widthClass?: string;
}

/**
 * Centered modal dialog with a blurred backdrop. Rendered in a portal to
 * document.body so `position: fixed` is relative to the viewport — otherwise an
 * ancestor's `backdrop-filter`/`transform` (e.g. the blurred sticky tab strip)
 * becomes the containing block and the dialog gets mispositioned/clipped.
 */
export function Dialog({ open, onClose, title, children, widthClass = "max-w-md" }: Props) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const titleId = useId();

  // Capture the element to restore focus to at the moment the dialog opens —
  // during render, before a child's `autoFocus` moves focus into the panel.
  // This must run in render (not an effect): the parent's effect fires after
  // the child's `autoFocus` effect has already moved focus into the panel, so
  // by then `document.activeElement` is no longer the trigger. Reading/writing
  // these refs here is the intended escape hatch for that timing.
  // eslint-disable-next-line react-hooks/refs -- see comment above
  if (open && !wasOpen.current) {
    // eslint-disable-next-line react-hooks/refs -- see comment above
    restoreRef.current = document.activeElement as HTMLElement | null;
  }
  // eslint-disable-next-line react-hooks/refs -- see comment above
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  // Focus management: move focus into the panel on open, trap Tab within it,
  // and restore focus to the trigger on close. Depends only on `open` so an
  // unstable `onClose` can't refocus the trigger mid-dialog.
  useEffect(() => {
    if (!open) return;
    const focusables = () =>
      Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Honor a child's `autoFocus`; otherwise focus the panel itself rather than
    // the header close button, so a stray Space/Enter can't dismiss the dialog.
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className={`relative w-full ${widthClass} overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none`}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 id={titleId} className="text-base font-semibold">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
