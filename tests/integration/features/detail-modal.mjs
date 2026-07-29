import fs from "node:fs";
import path from "node:path";
import { BASE, DATA_DIR } from "../env.mjs";

// Detail modal opens with the full-size cover (shared element). Covers modal
// open (no board scroll/reshuffle), edit persistence, rating, per-field
// click-to-edit, arrow-key nav, cover replace, the grid hover rating label,
// and the open-animation (fly-in) regressions — all threaded through the
// same `cid` (the comic opened here), so they stay in one feature file
// rather than passing that id across file boundaries.
export async function detailModalAndCoverFlows({ p, ck, sleep, apiJson }) {
  // Regression: opening the modal must NOT scroll the board underneath (the
  // fixed overlay used to drag the page to its DOM position, the bottom).
  // Scroll down first, then open a still-visible card via a real DOM click
  // (evaluate, so puppeteer doesn't auto-scroll the element into view).
  await p.evaluate(() => window.scrollTo(0, 500));
  await sleep(150);
  const scrollBefore = await p.evaluate(() => window.scrollY);
  await p.evaluate(() => {
    const vh = window.innerHeight;
    const img = [...document.querySelectorAll("main img[src*='thumb.webp']")].find((im) => {
      const r = im.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= vh;
    });
    (img.closest("button") ?? img).click();
  });
  await sleep(700);
  ck(/\/comic\//.test(p.url()), "clicking a card opens a comic route");
  const scrollAfter = await p.evaluate(() => window.scrollY);
  ck(
    Math.abs(scrollAfter - scrollBefore) < 50,
    `modal open keeps the board scroll position (${scrollBefore} -> ${scrollAfter})`,
  );
  ck(
    await p.evaluate(() => getComputedStyle(document.body).overflow === "hidden"),
    "background scroll is locked while the modal is open",
  );
  // First navigation to the modal route can cold-compile; wait for the image.
  const gotFull = await p
    .waitForSelector("img[src*='full.webp']", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  ck(gotFull, "modal shows full-size cover");
  const cid = p.url().split("/comic/")[1].split("?")[0];

  // Edit persists + modal reflects it immediately.
  const [edit] = await p.$$("xpath/.//button[contains(.,'Edit')]");
  await edit.click();
  await p.waitForSelector("input[type='date']", { timeout: 8000 }); // edit form mounted
  const ai = await p.evaluateHandle(() => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith("Cover Artists"));
    return l.parentElement.querySelector("input");
  });
  await ai.asElement().click();
  await ai.asElement().type("Integration Tester");
  await p.keyboard.press("Enter");
  await sleep(150);
  const [save] = await p.$$("xpath/.//button[contains(.,'Save')]");
  await save.click();
  await sleep(800);
  ck(await p.evaluate(() => document.body.innerText.includes("Integration Tester")), "edit shows immediately in the modal");
  const persisted = await apiJson(`/api/comics/${cid}`);
  ck(persisted.artists.includes("Integration Tester"), "edit persisted server-side");

  // Regression: rating a comic (a partial { rating } patch) must NOT wipe its
  // other metadata (authors/artists/characters/tags).
  // Target the 4-star button by its exact label — indexing into a filtered
  // list is brittle (the singular "1 star" label drops out of a $='stars'
  // match, and coarse pointers render 5 targets instead of 10).
  await (await p.$("button[aria-label='4 stars']")).click();
  await sleep(500);
  const afterRate = await apiJson(`/api/comics/${cid}`);
  ck(
    afterRate.rating === 4 && afterRate.artists.includes("Integration Tester"),
    `rating keeps other metadata (rating=${afterRate.rating}, artists kept=${afterRate.artists.includes("Integration Tester")})`,
  );

  // Click-to-edit-per-field: clicking a display field (not the global Edit
  // button) enters edit mode with that specific field focused.
  await p.evaluate(() => {
    document.querySelector("h2").closest("button").click();
  });
  await sleep(400);
  const seriesFocused = await p.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim().startsWith("Series"),
    );
    const input = label?.parentElement.querySelector("input");
    return !!input && document.activeElement === input;
  });
  ck(seriesFocused, "clicking the series title enters edit mode with the Series field focused");
  await p.keyboard.press("Escape"); // back to display mode (cancelEdit), not closing the modal
  await sleep(400);

  // Arrow-key prev/next navigation follows the board's visible order (navOrder).
  const beforeArrowUrl = p.url();
  await p.keyboard.press("ArrowRight");
  await sleep(500);
  const afterArrowUrl = p.url();
  ck(
    afterArrowUrl !== beforeArrowUrl && /\/comic\//.test(afterArrowUrl),
    "ArrowRight navigates the modal to the next comic",
  );
  await p.keyboard.press("ArrowLeft");
  await sleep(500);
  ck(p.url() === beforeArrowUrl, "ArrowLeft navigates back to the previous comic");

  await replaceCover({ p, ck, sleep, apiJson }, cid);

  await p.keyboard.press("Escape");
  await sleep(400);

  await flyInFlows({ p, ck, sleep, apiJson }, cid);
}

// Replace cover: upload path only — the Metron-search tab needs a live
// provider API key, same reason the Metron autofill UI isn't exercised
// elsewhere in this suite.
async function replaceCover({ p, ck, sleep, apiJson }, cid) {
  const tmpPngPath = path.join(DATA_DIR, "replace-cover-test.png");
  fs.writeFileSync(
    tmpPngPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const beforeImage = (await apiJson(`/api/comics/${cid}`)).imageUrl;
  const [replaceBtn] = await p.$$("xpath/.//button[normalize-space(.)='Replace cover']");
  await replaceBtn.click();
  await sleep(400);
  const fileInput = await p.$("input[type='file']");
  await fileInput.uploadFile(tmpPngPath);
  await sleep(1200);
  const afterReplace = await apiJson(`/api/comics/${cid}`);
  ck(afterReplace.imageUrl !== beforeImage, "replacing the cover changes the comic's image URL");
  ck(
    await p.evaluate(() => document.body.textContent.includes("Cover replaced")),
    "replace cover shows a success toast",
  );
  fs.rmSync(tmpPngPath, { force: true });
}

// Regression (issue #1): during the modal-open fly-in the cover must render
// at full opacity from its first frame — the shared-layout crossfade used to
// fade it 0->1 over the black backdrop, showing a darkened cover for ~150ms.
// And a cold open (full image never prefetched) must still get a real fly-in
// with decoded pixels: the undecoded <img> used to measure 0x0, skipping the
// flight entirely. Sample every rAF while opening and assert on the frames.
async function flyInFlows({ p, ck, sleep, apiJson }, cid) {
  const sampleModalOpen = async (open) => {
    await p.evaluate(() => {
      window.__flight = [];
      const t0 = performance.now();
      const tick = () => {
        const t = performance.now() - t0;
        const root = [...document.querySelectorAll("div.fixed")].find((d) =>
          d.className.includes("z-[70]"),
        );
        const img = root && root.querySelector("img");
        if (img) {
          const r = img.getBoundingClientRect();
          window.__flight.push({
            t,
            opacity: getComputedStyle(img).opacity,
            naturalWidth: img.naturalWidth,
            w: Math.round(r.width),
          });
        }
        if (t < 1200) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await open();
    await sleep(1400);
    return p.evaluate(() => window.__flight);
  };

  // Warm open: hover first (preloads + decodes the full image), then click.
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);

  // The grid hover label surfaces the rating (invisible in grid view otherwise).
  // The comic just rated 4 stars is the only rated one, so its card's label
  // (rendered in the DOM even at rest, just visually hidden) must read "4.0".
  const rated = await apiJson(`/api/comics/${cid}`);
  const gridRating = await p.evaluate((alt) => {
    const img = [...document.querySelectorAll("main img")].find(
      (i) => i.alt.trim() === alt,
    );
    const card = img && img.closest(".group");
    return card ? card.querySelector(".text-amber-400")?.textContent.trim() : null;
  }, `${rated.series} ${rated.issueNumber ? `#${rated.issueNumber}` : ""}`.trim());
  ck(gridRating === "4.0", `grid hover label shows the rating (got ${gridRating})`);

  const warmBox = await p.evaluate(() => {
    const img = document.querySelector("main img[src*='thumb.webp']");
    const r = img.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p.mouse.move(warmBox.x, warmBox.y);
  await sleep(500);
  let flight = await sampleModalOpen(() => p.mouse.click(warmBox.x, warmBox.y));
  ck(
    flight.length > 5 && flight.every((f) => f.opacity === "1"),
    `warm open: cover stays at full opacity through the fly-in (${flight.length} frames)`,
  );
  ck(flight[0]?.naturalWidth > 0, "warm open: cover has decoded pixels from the first frame");
  await p.keyboard.press("Escape");
  await sleep(600);

  // Cold open: keyboard-activate a card that was never hovered, so full.webp
  // was never requested. The thumbnail fallback must give the shared element
  // real dimensions immediately, so the fly-in runs (width grows over frames).
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);
  await p.evaluate(() => {
    const thumbs = [...document.querySelectorAll("main img[src*='thumb.webp']")];
    thumbs[thumbs.length - 1].closest("[role='button']").focus();
  });
  flight = await sampleModalOpen(() => p.keyboard.press("Enter"));
  ck(
    flight.length > 5 && flight[0]?.naturalWidth > 0,
    "cold open: cover renders decoded (thumbnail) pixels from the first frame",
  );
  ck(
    flight.length > 5 && flight[0].w < flight[flight.length - 1].w - 40,
    `cold open: fly-in actually runs (cover grows ${flight[0]?.w}px -> ${flight[flight.length - 1]?.w}px)`,
  );
  ck(
    flight.every((f) => f.opacity === "1"),
    "cold open: cover stays at full opacity through the fly-in",
  );
  await p.keyboard.press("Escape");
  await sleep(600);
}
