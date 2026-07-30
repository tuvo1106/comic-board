import { BASE } from "../env.mjs";

// Baseline board counts + virtualization. Returns N (the full collection
// size) since several later features (list-view row count, etc.) need it.
export async function boardCountsAndVirtualization({ p, ck, sleep, apiJson, coverCount, imgs, sortLabel }) {
  const N = (await apiJson("/api/comics")).length;

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(800);
  ck((await coverCount()) === N, `board reports all ${N} covers`);
  // The "My Comics" tab shows a count badge like custom board tabs (item 23).
  const myComicsTabCount = await p.evaluate(() => {
    // `a, button`: the non-draggable tabs (My Comics, Stats) are real links so
    // they middle-click; only the draggable board tabs are still buttons.
    const tab = [...document.querySelectorAll("a, button")].find((el) =>
      el.textContent.trim().startsWith("My Comics"),
    );
    const m = tab && tab.textContent.trim().match(/My Comics\s*(\d+)/);
    return m ? Number(m[1]) : null;
  });
  ck(myComicsTabCount === N, `My Comics tab shows the collection count (${myComicsTabCount})`);
  // Virtualization: only a viewport-sized window of cards is mounted, so the
  // rendered <img> count is a non-empty subset of the full board.
  const mounted = await imgs();
  ck(mounted > 0 && mounted < N, `masonry virtualizes (mounted ${mounted} of ${N})`);
  ck(/Cover date/.test(await sortLabel()), "My Comics defaults to Cover date sort");

  return { N };
}

// Regression: client-side filter via click must render the subset (not 0),
// and the board-scoped facet count must match what actually renders. Returns
// dcCount since the publisher-rename test right after needs it.
export async function filterAndFacets({ p, ck, sleep, coverCount, imgs }, { N }) {
  let [pub] = await p.$$("xpath/.//button[normalize-space(.)='Publisher']");
  await pub.click();
  await sleep(300);
  const [dc] = await p.$$("xpath/.//button[contains(., 'DC')]");
  await dc.click();
  await sleep(900);
  const dcCount = await coverCount();
  ck(dcCount > 0 && dcCount < N, `clicking Publisher>DC filters to a subset (${dcCount})`);
  ck((await imgs()) > 0, "filtered board still renders its (windowed) covers");
  // board-scoped facet count matches what renders (option text is like "DC14")
  const dcOptCount = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /^DC\d+$/.test(b.textContent.replace(/\s+/g, "")),
    );
    const m = btn && btn.textContent.replace(/\s+/g, "").match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  });
  ck(dcOptCount === dcCount, `facet dropdown count matches board count (${dcOptCount} vs ${dcCount})`);

  return { dcCount };
}

// Rename a publisher inline (pencil) — the new name applies to every comic
// that used it (normalized publishers). The dropdown is still open here.
export async function renamePublisherRoundTrip({ p, ck, sleep, apiJson }, { dcCount }) {
  await p.evaluate(() => document.querySelector("button[aria-label='Rename DC']").click());
  await sleep(200);
  await p.evaluate(() => {
    document.activeElement.value = "";
  });
  await p.keyboard.type("DC Comics");
  await p.keyboard.press("Enter");
  await sleep(900);
  const metaAfter = await apiJson("/api/meta");
  const renamed = metaAfter.publishers.find((x) => x.value === "DC Comics");
  ck(
    !!renamed && renamed.count === dcCount,
    `renaming DC -> "DC Comics" applies to all ${dcCount} comics (got ${renamed?.count})`,
  );
  ck(!metaAfter.publishers.some((x) => x.value === "DC"), 'old "DC" publisher is gone');
  // Restore the name (via the API) so later DC-filter checks still have data.
  await p.evaluate(() =>
    fetch("/api/publishers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "DC Comics", to: "DC" }),
    }).then((r) => r.json()),
  );
  await sleep(300);
}

// Drag-reorder persists (Manual sort). Go to a fresh board in manual order.
export async function dragReorderPersists({ p, ck, sleep }) {
  await p.goto(`${BASE}/?sort=manual`, { waitUntil: "networkidle0" });
  await sleep(800);
  const before = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  const boxes = await p.$$eval("main img[src*='thumb.webp']", (els) =>
    els.slice(0, 3).map((e) => {
      const r = e.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }),
  );
  await p.mouse.move(boxes[2].cx, boxes[2].cy);
  await p.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await p.mouse.move(boxes[2].cx + ((boxes[0].cx - boxes[2].cx) * i) / 14, boxes[2].cy + ((boxes[0].cy - boxes[2].cy) * i) / 14);
    await sleep(20);
  }
  await sleep(200);
  // Wait for the position PATCH to actually persist before reloading (the CI
  // runner is slow enough that a fixed sleep can race the request).
  const posPersisted = p
    .waitForResponse(
      (r) => /\/api\/comics\/[^/]+\/position/.test(r.url()) && r.request().method() === "PATCH",
      { timeout: 10000 },
    )
    .catch(() => null);
  await p.mouse.up();
  await posPersisted;
  await sleep(300);
  const after = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  ck(JSON.stringify(before) !== JSON.stringify(after), "drag changes order");
  await p.goto(`${BASE}/?sort=manual`, { waitUntil: "networkidle0" });
  await sleep(700);
  const reload = await p.$$eval("main img[src*='thumb.webp']", (els) => els.map((e) => e.getAttribute("alt")));
  ck(JSON.stringify(reload) === JSON.stringify(after), "reorder persists across reload");
}

// Regression: opening a comic must not reshuffle the board underneath — the
// board's filter/sort params are carried into the modal URL.
export async function modalPreservesBoardFilter({ p, ck, sleep, imgs }) {
  await p.goto(`${BASE}/?publisher=DC&sort=series`, { waitUntil: "networkidle0" });
  await sleep(700);
  const filteredCount = await imgs();
  await (await p.$$("main img[src*='thumb.webp']"))[0].click();
  await sleep(700);
  ck(
    /[?&]publisher=DC/.test(p.url()) && /[?&]sort=series/.test(p.url()),
    "opening a comic keeps the board's filter+sort in the URL",
  );
  ck(
    (await imgs()) === filteredCount,
    `board underneath keeps its filtered subset, not reshuffled (${await imgs()} vs ${filteredCount})`,
  );
  await p.keyboard.press("Escape");
  await p.goto(BASE, { waitUntil: "networkidle0" }); // reset to a clean board URL
  await sleep(500);
}
