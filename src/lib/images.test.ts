import fs from "node:fs";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { processUpload } from "./images";
import { storage } from "./storage";

/** Solid-color PNG of the given size, as an upload buffer. */
function testImage(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 40 } },
  })
    .png()
    .toBuffer();
}

const written: string[] = [];
afterAll(() => {
  for (const key of written) {
    try {
      fs.rmSync(storage.resolve(key), { force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("processUpload (sharp pipeline)", () => {
  it("produces full webp + ~500px thumb + blur placeholder + real dimensions", async () => {
    const out = await processUpload(await testImage(800, 1200));
    written.push(out.imagePath, out.thumbPath);

    expect(out.id).toMatch(/^[0-9a-z]{14}$/);
    expect(out.imagePath).toBe(`covers/${out.id}/full.webp`);
    expect(out.thumbPath).toBe(`covers/${out.id}/thumb.webp`);
    expect(out.blurDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(out.width).toBe(800);
    expect(out.height).toBe(1200);

    // Files are actually written and are valid webp of the expected sizes.
    const full = await sharp(storage.resolve(out.imagePath)).metadata();
    expect(full.format).toBe("webp");
    expect(full.width).toBe(800);
    const thumb = await sharp(storage.resolve(out.thumbPath)).metadata();
    expect(thumb.width).toBe(500);
  });

  it("caps very large images to the max full width, preserving aspect ratio", async () => {
    const out = await processUpload(await testImage(3000, 4000));
    written.push(out.imagePath, out.thumbPath);
    expect(out.width).toBe(1600);
    expect(Math.abs(out.height / out.width - 4000 / 3000)).toBeLessThan(0.01);
  });

  it("does not enlarge small images for the thumbnail", async () => {
    const out = await processUpload(await testImage(300, 450));
    written.push(out.imagePath, out.thumbPath);
    const thumb = await sharp(storage.resolve(out.thumbPath)).metadata();
    expect(thumb.width).toBe(300);
  });
});
