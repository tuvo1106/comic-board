import { BASE } from "../env.mjs";

/**
 * Mirrors `MAX_UPSCALE_WIDTH` in src/lib/upscale/types.ts. Stated here rather
 * than imported: these tests are plain .mjs, and Node's type-stripping refuses
 * that module over `UpscaleError`'s constructor parameter property. Asserting
 * the number literally is arguably better anyway — importing the constant would
 * make the test agree with the code by construction rather than check it.
 */
const MAX_UPSCALE_WIDTH = 2400;

/**
 * Cover upscaling, driven end-to-end against a stub binary (see
 * `tests/integration/fake-upscaler.mjs`) — real route, real `processUpload`,
 * real accept/revert, fake pixels.
 *
 * The property worth protecting here is that **nothing is committed until the
 * user accepts**. A preview that quietly mutated the comic would be the same
 * dead-end class as the cover bugs fixed earlier: an irreversible change made
 * on the user's behalf before they'd agreed to it.
 */
export async function upscaleCover({ p, ck, sleep, apiJson }) {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);

  const clickByText = (text) =>
    p.evaluate((t) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t)?.click();
    }, text);
  const bodyHas = (t) => p.evaluate((s) => document.body.textContent.includes(s), t);

  const before = (await apiJson("/api/comics"))[0];
  ck(!before.upscaled, `starts un-upscaled (${before.width}x${before.height})`);

  // The action is gated on UPSCALER_BIN; the test env sets it to the stub.
  ck((await apiJson("/api/upscale")).available === true, "the upscaler reports itself configured");

  await p.goto(`${BASE}/comic/${before.id}`, { waitUntil: "networkidle0" });
  await sleep(900);
  ck(
    await p.evaluate(
      () => !!document.body.textContent.match(/\d+\s*×\s*\d+/),
      // The dimensions readout is what tells you whether upscaling is worth it.
    ),
    "the detail view shows the cover's pixel size",
  );
  ck(await bodyHas("Upscale"), "and offers an Upscale action");

  // Opening starts the upscale immediately — there's no confirm step, since
  // with a single scale it was a button that only said "yes really".
  await clickByText("Upscale");
  await sleep(400);
  ck(await bodyHas("Upscaling to"), "opening runs the upscale straight away");
  // The stub still runs sharp over a real image; give it room on a slow runner.
  await p.waitForFunction(() => document.body.textContent.includes("Keep it"), { timeout: 60000 });

  const previewed = await p.evaluate(() => ({
    hasCompare: !!document.querySelector("input[type='range'][aria-label^='Compare']"),
    hasUpscaledImg: !!document.querySelector("img[alt='Upscaled cover']"),
    hasCurrentImg: !!document.querySelector("img[alt='Current cover']"),
  }));
  ck(previewed.hasCompare, "a preview offers the before/after comparison slider");
  ck(
    previewed.hasUpscaledImg && previewed.hasCurrentImg,
    "with both covers rendered so they can actually be compared",
  );

  // The core guarantee: previewing changed nothing.
  const midway = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(
    midway.imageUrl === before.imageUrl && midway.upscaled === false,
    "previewing does NOT touch the comic — nothing is committed until accept",
  );

  await clickByText("Discard");
  await sleep(800);
  ck(!(await bodyHas("Keep it")), "discarding closes the dialog");
  const afterDiscard = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(
    afterDiscard.imageUrl === before.imageUrl && !afterDiscard.upscaled,
    "and leaves the cover untouched",
  );

  // --- Accept ------------------------------------------------------------
  await clickByText("Upscale");
  await p.waitForFunction(() => document.body.textContent.includes("Keep it"), { timeout: 60000 });
  await clickByText("Keep it");
  await sleep(1500);

  const accepted = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(accepted.upscaled === true, "accepting marks the cover as upscaled");
  ck(
    accepted.width > before.width,
    `and it is bigger (${before.width}x${before.height} -> ${accepted.width}x${accepted.height})`,
  );
  // The seed's first cover is already 1600px, so a raw 4× would be 6400 — this
  // is the case the cap exists for. Every cover converging on the same ceiling
  // is the point: consistent sizes, and no absurdly large files from covers
  // that were already large.
  ck(
    accepted.width === MAX_UPSCALE_WIDTH,
    `capped at the shared ceiling rather than a raw 4× (${accepted.width} vs ${before.width * 4})`,
  );
  ck(
    Math.abs(accepted.width / accepted.height - before.width / before.height) < 0.01,
    "and the aspect ratio survives the cap",
  );
  ck(accepted.imageUrl !== before.imageUrl, "pointing at a new image url");
  ck(accepted.series === before.series, "with the metadata untouched");

  // --- Revert ------------------------------------------------------------
  await p.goto(`${BASE}/comic/${before.id}`, { waitUntil: "networkidle0" });
  await sleep(900);
  ck(await bodyHas("Revert to the original cover"), "an upscaled cover offers a revert");

  await clickByText("Revert to the original cover");
  await sleep(1800);
  const reverted = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(
    reverted.imageUrl === before.imageUrl,
    `reverting restores the exact original image (${reverted.imageUrl})`,
  );
  ck(
    reverted.width === before.width && reverted.height === before.height,
    `at its original size (${reverted.width}x${reverted.height})`,
  );
  ck(!reverted.upscaled, "and clears the upscaled flag");

  // The original file must have survived the whole round trip — a revert that
  // restored a path to a deleted file would still "pass" the checks above.
  const img = await p.evaluate(async (url) => {
    const r = await fetch(url);
    return { ok: r.ok, bytes: (await r.blob()).size };
  }, reverted.imageUrl);
  ck(img.ok && img.bytes > 0, `and the restored file is really on disk (${img.bytes} bytes)`);
}
