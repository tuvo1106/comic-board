import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { UpscaleError, type Upscaler, type UpscaleScale } from "./types";

const run = promisify(execFile);

/** A cover shouldn't take anywhere near this; the cap is so a wedged GPU can't hang the request. */
const TIMEOUT_MS = 120_000;

/**
 * Real-ESRGAN via the standalone `realesrgan-ncnn-vulkan` binary — GPU-accelerated
 * through Vulkan/Metal, no Python runtime. The `-anime` model is trained on
 * illustrated line art, which is what a comic cover is; the photo models
 * smear inked linework.
 *
 * The binary is file-in/file-out with no stdin/stdout mode, hence the temp
 * files. They live in the OS temp dir rather than DATA_DIR so a crashed run
 * leaves nothing behind in the user's collection, and are removed in a `finally`
 * either way.
 */
export function localUpscaler(bin: string): Upscaler {
  // `digital-art-4x` rather than an anime/photo model: it's the illustration
  // model in Upscayl's bundled set, which is the easiest binary to get hold of
  // on macOS (`brew install --cask upscayl`) since upstream Real-ESRGAN has no
  // Homebrew formula. Override for a different model set — upstream's builds
  // name theirs `realesrgan-x4plus-anime`.
  const model = process.env.UPSCALER_MODEL ?? "digital-art-4x";
  // Upscayl keeps its models inside the .app bundle rather than beside the
  // binary, so this is effectively required there; upstream builds find their
  // own and can leave it unset.
  const modelDir = process.env.UPSCALER_MODEL_DIR;

  return {
    id: "ncnn-local",
    label: `Real-ESRGAN (${model})`,

    async run(input: Buffer, scale: UpscaleScale): Promise<Buffer> {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "comic-upscale-"));
      const inPath = path.join(dir, `${randomUUID()}.png`);
      const outPath = path.join(dir, `${randomUUID()}.png`);
      try {
        // PNG in and out: the models expect lossless input, and re-encoding to
        // webp is the storage pipeline's job (`processUpload`), not ours.
        await fs.writeFile(inPath, await sharp(input).png().toBuffer());

        // The anime model is 4×-only. Asking the binary for `-s 2` with a 4×
        // model errors out, so always run it native and resample down for 2× —
        // which also looks better than a native 2× model on this material.
        const args = ["-i", inPath, "-o", outPath, "-n", model, "-s", "4"];
        if (modelDir) args.push("-m", modelDir);

        try {
          await run(bin, args, { timeout: TIMEOUT_MS, maxBuffer: 1 << 24 });
        } catch (err) {
          const e = err as { killed?: boolean; code?: string; stderr?: string };
          if (e.killed || e.code === "ETIMEDOUT") {
            throw new UpscaleError("Upscaling timed out", 504);
          }
          // stderr can name the binary path and model dir — log it, don't return it.
          throw new UpscaleError("The upscaler failed on this image");
        }

        const out = await fs.readFile(outPath).catch(() => null);
        if (!out || out.length === 0) {
          throw new UpscaleError("The upscaler produced no output");
        }

        if (scale === 4) return out;

        // Resample 4× down to the requested 2×, from the model's own output
        // rather than the source — the detail it invented survives the
        // downsample and reads sharper than a straight 2× would.
        const meta = await sharp(input).metadata();
        if (!meta.width) throw new UpscaleError("Could not read the source dimensions");
        return await sharp(out)
          .resize({ width: meta.width * scale, kernel: "lanczos3" })
          .png()
          .toBuffer();
      } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}
