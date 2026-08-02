"use client";

/**
 * The blurred-silhouette fill behind a cover.
 *
 * Comics are portrait and viewports aren't, so any box big enough to show a
 * cover whole has dead space either side of it. This fills that space with the
 * cover itself, blurred — the colour is always right because it comes from the
 * artwork, and it reads as the cover's own light rather than as a letterbox.
 *
 * Two layers, because they do different jobs. `blurDataUrl` is a ~300-byte
 * inline thumbnail: it paints instantly with no request, so a cold open is
 * never a flat black panel — but it's ~16px wide, so it has no detail to
 * reveal no matter how little blur you put on it. The real thumbnail on top
 * carries actual artwork, and is already being fetched for the cover itself,
 * so it costs nothing extra. Both are scaled past the edges so the blur's soft
 * boundary never shows.
 *
 * Extracted from the detail modal so the full-screen viewer gets the same
 * treatment rather than a second implementation of it.
 */
export function CoverBackdrop({
  blurDataUrl,
  thumbUrl,
  /** How hard to hold the fill back. Heavier full-screen, where it's the whole view. */
  scrimClass = "bg-black/30",
}: {
  blurDataUrl: string;
  thumbUrl: string;
  scrimClass?: string;
}) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url(${blurDataUrl})` }}
      />
      <div
        aria-hidden
        className="absolute inset-0 scale-110 bg-cover bg-center blur-lg"
        style={{ backgroundImage: `url(${thumbUrl})` }}
      />
      {/* Scrim: enough to keep the cover the subject, light enough that the
          artwork behind still reads. */}
      <div aria-hidden className={`absolute inset-0 ${scrimClass}`} />
    </>
  );
}
