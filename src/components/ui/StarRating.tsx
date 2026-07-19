"use client";

import { useState } from "react";

function StarSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block">
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
    </svg>
  );
}

function StarRow({ size, className }: { size: number; className?: string }) {
  return (
    <div className={`flex ${className ?? ""}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarSvg key={i} size={size} />
      ))}
    </div>
  );
}

interface Props {
  value: number | null;
  /** Interactive when provided; clicking the current value clears it (null). */
  onChange?: (value: number | null) => void;
  size?: number;
  readOnly?: boolean;
}

/**
 * 0.5-step star rating. Renders a muted empty row with an amber filled row
 * clipped to the (hovered or set) value; ten half-width buttons set 0.5–5.
 */
export function StarRating({ value, onChange, size = 22, readOnly }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const pct = (Math.max(0, Math.min(5, shown)) / 5) * 100;
  const interactive = !readOnly && !!onChange;

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="relative inline-flex"
        onMouseLeave={() => setHover(null)}
      >
        <StarRow size={size} className="text-border gap-0.5" />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${pct}%` }}
        >
          <StarRow size={size} className="w-max text-amber-400 gap-0.5" />
        </div>

        {interactive && (
          <div className="absolute inset-0 flex">
            {Array.from({ length: 10 }, (_, i) => {
              const v = (i + 1) / 2; // 0.5, 1, ... 5
              return (
                <button
                  key={v}
                  type="button"
                  aria-label={`${v} stars`}
                  onMouseEnter={() => setHover(v)}
                  onClick={() => onChange!(value === v ? null : v)}
                  className="h-full flex-1 cursor-pointer"
                />
              );
            })}
          </div>
        )}
      </div>

      {interactive && (
        <span className="min-w-8 text-xs text-muted">
          {value != null ? value.toFixed(1) : "—"}
        </span>
      )}
    </div>
  );
}
