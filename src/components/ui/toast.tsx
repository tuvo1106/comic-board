"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastKind = "info" | "error" | "success";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

/** Max toasts on screen at once; extras drop the oldest so a batch can't tower. */
const MAX_TOASTS = 4;
const TOAST_MS = 4000;

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    setToasts((t) => {
      // Dedupe: an identical message already on screen doesn't stack again.
      if (t.some((x) => x.message === message && x.kind === kind)) return t;
      const next = [...t, { id: ++idRef.current, message, kind }];
      // Cap: keep only the most recent MAX_TOASTS.
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  // One auto-dismiss timer per toast id, created once and cleared when the
  // toast leaves — so adding a toast never resets another's remaining life.
  useEffect(() => {
    const live = new Set(toasts.map((t) => t.id));
    for (const t of toasts) {
      if (!timers.current.has(t.id)) {
        timers.current.set(
          t.id,
          setTimeout(() => remove(t.id), TOAST_MS),
        );
      }
    }
    for (const [id, handle] of timers.current) {
      if (!live.has(id)) {
        clearTimeout(handle);
        timers.current.delete(id);
      }
    }
  }, [toasts, remove]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handle of map.values()) clearTimeout(handle);
      map.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur ${
                t.kind === "error"
                  ? "bg-danger/90 text-white"
                  : t.kind === "success"
                    ? "bg-emerald-600/90 text-white"
                    : "bg-surface-2/95 text-fg ring-1 ring-border"
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
