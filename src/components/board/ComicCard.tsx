"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { ComicDTO } from "@/lib/types";

// Decode the full-size cover ahead of a click (on hover/touch-start) so the
// detail modal opens on an already-decoded image instead of briefly showing the
// darkened card through the not-yet-loaded modal image. Deduped per URL.
const preloaded = new Set<string>();
function preloadFull(url: string) {
  if (typeof window === "undefined" || preloaded.has(url)) return;
  preloaded.add(url);
  const img = new window.Image();
  img.src = url;
}

interface Props {
  comic: ComicDTO;
  height: number;
  onOpen?: () => void;
  /** Optional overlay control (e.g. the "…" menu button) rendered top-right. */
  menu?: React.ReactNode;
  /** Hide the shared-element layoutId (used by the drag overlay clone). */
  noLayoutId?: boolean;
}

/**
 * A single cover. The blur placeholder is painted immediately as the background;
 * the real thumbnail crossfades in on load so nothing shifts. The cover image
 * carries a shared `layoutId` so it can expand into the detail modal.
 */
export function ComicCard({ comic, height, onOpen, menu, noLayoutId }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="group relative h-full w-full cursor-pointer select-none overflow-hidden rounded-[var(--radius-card)] bg-surface-2 shadow-md ring-1 ring-white/5 transition-[box-shadow,transform] duration-150 ease-out hover:z-10 hover:shadow-xl"
      style={{ height }}
      onClick={onOpen}
      onPointerEnter={() => preloadFull(comic.imageUrl)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
    >
      <motion.div
        layoutId={noLayoutId ? undefined : `cover-${comic.id}`}
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${comic.blurDataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comic.thumbUrl}
          alt={`${comic.series} ${comic.issueNumber ? `#${comic.issueNumber}` : ""}`}
          className="h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
          loading="lazy"
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
      </motion.div>

      {/* Bottom gradient + label, revealed on hover. Coarse pointers (touch)
          have no hover, so show it at rest there. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 pt-10 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100">
        <p className="truncate text-sm font-semibold text-white drop-shadow">{comic.series}</p>
        {comic.issueNumber && (
          <p className="text-xs font-medium text-white/75">#{comic.issueNumber}</p>
        )}
      </div>

      {menu && (
        <div
          className="absolute right-2 top-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 pointer-coarse:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {menu}
        </div>
      )}
    </div>
  );
}
