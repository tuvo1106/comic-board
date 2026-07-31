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
  // Keyed on the spinner, not copy: the running state deliberately has no
  // "Upscaling…" caption (the dialog title and the spinner already say it), so
  // asserting on words would break every time the wording is tightened.
  ck(
    await p.evaluate(() => !!document.querySelector("[role='dialog'] svg.animate-spin")),
    "opening runs the upscale straight away",
  );

  // The target size counts up from the source and sharpens as it lands. Driven
  // by MotionValues written straight to the DOM (no React state), so the only
  // way to know it's working is to sample the text over time — a static render
  // of the final number would look identical in a single snapshot.
  const digits = () =>
    p.evaluate(() => {
      const p2 = [...document.querySelectorAll("[role='dialog'] p")].find((n) =>
        /→/.test(n.textContent),
      );
      return p2 ? p2.textContent.replace(/\s+/g, " ").trim() : null;
    });
  const frames = [];
  for (let i = 0; i < 6; i++) {
    frames.push(await digits());
    await sleep(120);
  }
  const distinct = [...new Set(frames.filter(Boolean))];
  ck(
    distinct.length > 1,
    `the target size animates rather than just appearing (${distinct.length} distinct frames)`,
  );

  // Direction and bounds, not the settled value: the sampling window is shorter
  // than the animation, and racing it against the upscale (which may finish
  // first and swap in the comparison) would make an exact-final-value assertion
  // timing-dependent. Growing from the source toward the cap is the real claim.
  const widthOf = (txt) => {
    const m = txt?.match(/→\s*(\d+)\s*×\s*(\d+)px/);
    return m ? Number(m[1]) : null;
  };
  const widths = frames.map(widthOf).filter((n) => n !== null);
  ck(
    widths.length > 1 && widths[widths.length - 1] > widths[0],
    `counting upward, not down or static (${widths[0]} → ${widths[widths.length - 1]})`,
  );
  ck(
    widths.every((w) => w >= before.width && w <= MAX_UPSCALE_WIDTH),
    `and every frame sits between the source and the cap (${Math.min(...widths)}–${Math.max(...widths)})`,
  );
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

  // The blurred backdrop shipped invisible once: the compare stack has to sit at
  // the cover's exact aspect ratio, so it filled its own box edge to edge and
  // covered the backdrop completely. Nothing about "the images render" catches
  // that — the check has to be geometric. Asserts the backdrop box is strictly
  // bigger than the stack, i.e. there's actually somewhere for blur to show.
  const backdrop = await p.evaluate(() => {
    // Scoped to the dialog. Unscoped, `[aria-hidden].blur-lg` matched the
    // *detail modal's* own blurred cover panel sitting behind this one — so the
    // check was comparing two unrelated boxes and its numbers meant nothing.
    const dlg = document.querySelector("[role='dialog']");
    const img = dlg?.querySelector("img[alt='Current cover']");
    const blur = dlg?.querySelector("[aria-hidden].blur-lg");
    if (!img || !blur) return null;
    const stack = img.parentElement; // the aspect-ratio compare box
    const box = blur.parentElement; // whatever carries the backdrop
    const s = stack.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return {
      // The decisive one. In the broken version the blur layers were siblings
      // of the image inside the *same* aspect-ratio box, so this was true and
      // the backdrop was covered edge to edge. Comparing rects alone wouldn't
      // catch it: `scale-110` makes a covered layer measure larger anyway.
      sameBox: box === stack,
      wraps: box.contains(stack),
      padX: Math.round(b.width - s.width),
      padY: Math.round(b.height - s.height),
    };
  });
  ck(
    backdrop !== null && !backdrop.sameBox && backdrop.wraps,
    "the backdrop is a box around the cover, not a layer underneath it",
  );
  ck(
    backdrop !== null && backdrop.padX > 0 && backdrop.padY > 0,
    `so the blur actually shows (${backdrop?.padX}px × ${backdrop?.padY}px of surround)`,
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
  ck(await bodyHas("Revert"), "an upscaled cover offers a revert");

  await clickByText("Revert");
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

  // --- Upscaling again after a revert --------------------------------------
  // Reported from real use. `keep()` closes without resetting the preview
  // mutation — the candidate had become the live cover, so there was nothing to
  // discard — which left it in `success` still holding that candidate. Opening
  // again found it non-idle, skipped the run, and rendered the *old* comparison
  // against files the revert had since deleted.
  await clickByText("Upscale");
  await sleep(500);
  const reopened = await p.evaluate(() => ({
    spinning: !!document.querySelector("[role='dialog'] svg.animate-spin"),
    // The tell for the bug: a comparison already on screen half a second in
    // means it served a cached candidate instead of starting work.
    staleComparison: !!document.querySelector("[role='dialog'] img[alt='Upscaled cover']"),
  }));
  ck(reopened.spinning, "upscaling again after a revert starts a fresh run");
  ck(!reopened.staleComparison, "rather than showing the previous run's comparison");

  await p.waitForFunction(() => document.body.textContent.includes("Keep it"), { timeout: 60000 });
  const second = await p.evaluate(
    () => document.querySelector("[role='dialog'] img[alt='Upscaled cover']")?.src ?? null,
  );
  ck(Boolean(second), "and the second run produces its own candidate");
  // Load it, so a candidate pointing at a deleted folder can't pass.
  const secondBytes = await p.evaluate(async (url) => {
    const r = await fetch(url);
    return r.ok ? (await r.blob()).size : 0;
  }, second);
  ck(secondBytes > 0, `whose image really exists (${secondBytes} bytes)`);
  await clickByText("Discard");
  await sleep(600);
}
