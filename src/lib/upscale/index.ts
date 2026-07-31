import { localUpscaler } from "./local";
import { UpscaleError, type Upscaler } from "./types";

export { UpscaleError, UPSCALE_SCALES, isUpscaleScale } from "./types";
export type { Upscaler, UpscaleScale } from "./types";

/**
 * Upscaling is opt-in and gated on a binary the user installs themselves, the
 * same way metadata autofill is gated on `METRON_API_KEY` — set `UPSCALER_BIN`
 * and the UI grows an Upscale action, leave it unset and the action isn't
 * rendered at all. Better than showing a button that errors on click.
 */
export function isUpscalerConfigured(): boolean {
  return Boolean(process.env.UPSCALER_BIN);
}

/** The configured upscaler, or a client-safe error if it isn't set up. */
export function getUpscaler(): Upscaler {
  const bin = process.env.UPSCALER_BIN;
  if (!bin) throw new UpscaleError("Upscaling is not configured", 501);
  return localUpscaler(bin);
}

/** Describes the backend to the client so the UI can name what produced an image. */
export function upscalerInfo(): { available: boolean; label: string | null } {
  if (!isUpscalerConfigured()) return { available: false, label: null };
  return { available: true, label: getUpscaler().label };
}
