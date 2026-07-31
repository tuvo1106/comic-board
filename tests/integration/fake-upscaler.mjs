import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./env.mjs";

/**
 * A stand-in for `realesrgan-ncnn-vulkan`, so the upscale flow can be driven
 * end-to-end without a GPU, a model download, or ~5s per image in CI.
 *
 * It honours the real binary's contract and nothing more: parse `-i` and `-o`,
 * write a 4×-larger image to the output path, exit 0. Everything downstream —
 * the route, `processUpload`, accept/revert, the compare UI — is the real code
 * path; only the pixels are fake.
 *
 * Uses the app's own `sharp` to do the enlargement, so the output is a genuine
 * image with genuine dimensions rather than a copied file. A no-op copy would
 * make "did it actually get bigger?" unassertable, which is the one thing this
 * flow most needs to prove.
 */
export function writeFakeUpscaler() {
  const binPath = path.join(DATA_DIR, "fake-upscaler.mjs");
  const shPath = path.join(DATA_DIR, "fake-upscaler");
  fs.mkdirSync(DATA_DIR, { recursive: true });

  fs.writeFileSync(
    binPath,
    `import sharp from "sharp";
const a = process.argv;
const inPath = a[a.indexOf("-i") + 1];
const outPath = a[a.indexOf("-o") + 1];
const scale = Number(a[a.indexOf("-s") + 1] || 4);
const img = sharp(inPath);
const { width, height } = await img.metadata();
await img.resize({ width: width * scale, height: height * scale, kernel: "nearest" })
  .png()
  .toFile(outPath);
`,
  );

  // The route invokes the binary via execFile, so it needs to be executable and
  // self-contained — hence the shell shim rather than passing "node" as the bin.
  fs.writeFileSync(shPath, `#!/bin/sh\nexec node "${binPath}" "$@"\n`);
  fs.chmodSync(shPath, 0o755);
  return shPath;
}
