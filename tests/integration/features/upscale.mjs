import { BASE } from "../env.mjs";

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

  await clickByText("Upscale");
  await sleep(600);
  ck(await bodyHas("Current size"), "the dialog opens on the size/scale step");

  await clickByText("Upscale 2×");
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
  await sleep(600);
  ck(await bodyHas("Current size"), "discarding returns to the start rather than closing");
  const afterDiscard = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(
    afterDiscard.imageUrl === before.imageUrl && !afterDiscard.upscaled,
    "and leaves the cover untouched",
  );

  // --- Accept ------------------------------------------------------------
  await clickByText("Upscale 2×");
  await p.waitForFunction(() => document.body.textContent.includes("Keep it"), { timeout: 60000 });
  await clickByText("Keep it");
  await sleep(1500);

  const accepted = (await apiJson("/api/comics")).find((c) => c.id === before.id);
  ck(accepted.upscaled === true, "accepting marks the cover as upscaled");
  ck(
    accepted.width === before.width * 2 && accepted.height === before.height * 2,
    `and it is actually 2× bigger (${before.width}x${before.height} -> ${accepted.width}x${accepted.height})`,
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
