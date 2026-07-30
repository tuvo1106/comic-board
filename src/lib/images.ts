import sharp from "sharp";
import { newId } from "./ids";
import { storage } from "./storage";

/** Output of running an uploaded cover through the resize/blur/store pipeline. */
export interface ProcessedImage {
  id: string;
  imagePath: string; // storage key for the full-size webp
  thumbPath: string; // storage key for the ~500px thumb
  blurDataUrl: string; // tiny base64 placeholder (data URL)
  width: number; // original dimensions
  height: number;
}

const THUMB_WIDTH = 500;
const BLUR_WIDTH = 16;
const MAX_FULL_WIDTH = 1600; // cap the "full" image to keep storage sane

/**
 * Turn an uploaded image buffer into: a full-size webp, a thumbnail webp, and a
 * base64 blur placeholder. Returns dimensions of the (capped) full image so the
 * masonry can reserve aspect-ratio space.
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  const id = newId();
  // Decode + EXIF-orient once; clone() per output so full/thumb/blur share the
  // single decoded input instead of re-decoding the buffer four times.
  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }

  // Full image: cap width, re-encode as webp.
  const fullPipeline = base.clone();
  if (meta.width > MAX_FULL_WIDTH) {
    fullPipeline.resize({ width: MAX_FULL_WIDTH });
  }
  const fullBuf = await fullPipeline.webp({ quality: 82 }).toBuffer();
  const fullMeta = await sharp(fullBuf).metadata();
  const width = fullMeta.width ?? meta.width;
  const height = fullMeta.height ?? meta.height;

  const thumbBuf = await base
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const blurBuf = await base
    .clone()
    .resize({ width: BLUR_WIDTH })
    .webp({ quality: 45 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuf.toString("base64")}`;

  const imagePath = `covers/${id}/full.webp`;
  const thumbPath = `covers/${id}/thumb.webp`;
  await storage.put(imagePath, fullBuf);
  await storage.put(thumbPath, thumbBuf);

  return { id, imagePath, thumbPath, blurDataUrl, width, height };
}
