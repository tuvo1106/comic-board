/**
 * Cover upscaling. Deliberately shaped like `StorageAdapter` (`src/lib/storage.ts`):
 * one narrow interface with a local implementation today, so a different backend
 * — a beefier GPU box on the LAN, say — is a drop-in later without callers
 * changing. `run()` takes and returns bytes and nothing else; anything
 * process- or filesystem-specific belongs inside an implementation.
 */
export interface Upscaler {
  /** Identifies the backend in logs and in the UI's "how was this made" line. */
  id: string;
  /** Human-readable model/backend label, e.g. "Real-ESRGAN (anime) ×4". */
  label: string;
  /**
   * Enlarge an image by `scale`. Implementations may run a fixed-factor model
   * and resample to hit the requested scale — callers only care about the
   * result being `scale`× the input's dimensions.
   */
  run(input: Buffer, scale: UpscaleScale): Promise<Buffer>;
}

/** Supported factors. 2 is the sweet spot for ~600px comic scans; 4 tends to look synthetic. */
export const UPSCALE_SCALES = [2, 4] as const;
export type UpscaleScale = (typeof UPSCALE_SCALES)[number];

export function isUpscaleScale(n: number): n is UpscaleScale {
  return (UPSCALE_SCALES as readonly number[]).includes(n);
}

/**
 * Client-safe failure. Mirrors `MetadataError` so `handle()`/`authed()` can map
 * it to a status without leaking a binary path or command line to the client.
 */
export class UpscaleError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "UpscaleError";
  }
}
