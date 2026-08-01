import { BASE } from "../env.mjs";

/**
 * Stats page (item 2c). Self-contained: navigates in from the board and leaves
 * a clean board URL behind, so it can sit anywhere in the run order.
 *
 * The assertions that matter here are the ones a unit test can't make: that the
 * numbers on screen agree with what `/api/comics` actually returns, that the
 * bars are real links into the board's filter contract, and that clicking one
 * lands on the filtered collection. `src/lib/stats.test.ts` already covers the
 * bucketing maths itself — this covers the wiring.
 */
export async function statsPage({ p, ck, sleep, apiJson, coverCount }) {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);

  // Stats is a peer view in the tab strip, not a header action — so it's found
  // in the same place as every other view, and highlights itself like one.
  const entry = await p.evaluate(() => {
    const strip = document.querySelector("div.sticky");
    return {
      inStrip: !!strip?.querySelector("a[href='/stats']"),
      inHeader: !!document.querySelector("header a[href='/stats']"),
      // A count here would re-imply the stats are scoped to a subset.
      hasCount: /\d/.test(strip?.querySelector("a[href='/stats']")?.textContent ?? ""),
    };
  });
  ck(entry.inStrip, "Stats sits in the tab strip alongside the boards");
  ck(!entry.inHeader, "and isn't duplicated as a header button");
  ck(!entry.hasCount, "it carries no count, unlike the board tabs");

  // Tag the live chrome so the navigation below can prove it was *kept*, not
  // rebuilt. TopBar and BoardTabs used to be rendered inside each page, so
  // moving between views tore the whole header down and mounted a fresh copy —
  // a client-side navigation that looked exactly like a full page reload. They
  // now live in the (collection) group's layout, so only <main> swaps.
  await p.evaluate(() => {
    window.__chromeProbe = "alive";
    document.querySelector("header").dataset.probe = "same-node";
  });

  await p.evaluate(() => document.querySelector("div.sticky a[href='/stats']").click());
  await sleep(1200);
  ck(new URL(p.url()).pathname === "/stats", `the Stats tab navigates there (at ${p.url()})`);

  const persisted = await p.evaluate(() => ({
    header: document.querySelector("header")?.dataset.probe === "same-node",
    js: window.__chromeProbe === "alive",
    navEntries: performance.getEntriesByType("navigation").length,
  }));
  ck(persisted.js && persisted.navEntries === 1, "navigating to stats is a client-side transition");
  ck(
    persisted.header,
    "and the header survives it rather than being rebuilt (no reload flash)",
  );

  const read = () =>
    p.evaluate(() => {
      const cards = [...document.querySelectorAll("main > div > section:first-of-type > div")].map(
        (el) => ({
          value: el.querySelector("p")?.textContent.trim() ?? "",
          label: el.querySelectorAll("p")[1]?.textContent.trim() ?? "",
        }),
      );
      const panels = [...document.querySelectorAll("main section h2")].map((h) =>
        h.textContent.trim(),
      );
      const barLinks = [...document.querySelectorAll("main a[href^='/?']")].map((a) =>
        a.getAttribute("href"),
      );
      return {
        cards,
        panels,
        barLinks,
        // Nothing on this page may push the document sideways.
        overflows: document.body.scrollWidth > window.innerWidth,
        heading: document.querySelector("main h1")?.textContent.trim() ?? null,
      };
    });

  const view = await read();
  ck(view.heading === "Stats", `the page is titled Stats (got ${view.heading})`);

  // Every chart the roadmap asked for is present.
  for (const title of ["By publisher", "Ratings", "By release year"]) {
    ck(view.panels.includes(title), `the "${title}" chart renders`);
  }
  for (const title of ["Top series", "Top cover artists", "Top authors", "Top characters"]) {
    ck(view.panels.includes(title), `the "${title}" leaderboard renders`);
  }
  ck(!view.overflows, "the page doesn't scroll sideways");

  // The headline numbers have to agree with the real collection, not just be
  // plausible — this is the assertion that would catch a wrong reduce.
  const comics = await apiJson("/api/comics");
  const card = (label) => view.cards.find((c) => c.label === label)?.value ?? null;
  ck(card("Covers") === String(comics.length), `the Covers card matches /api/comics (${card("Covers")} vs ${comics.length})`);
  ck(
    card("Series") === String(new Set(comics.map((c) => c.series)).size),
    `the Series card counts distinct series (${card("Series")})`,
  );
  ck(
    card("Publishers") === String(new Set(comics.map((c) => c.publisher).filter(Boolean)).size),
    `the Publishers card counts distinct publishers (${card("Publishers")})`,
  );

  // Bars are anchors into the board's own filter URL contract, so the two can't
  // silently drift apart.
  ck(view.barLinks.length > 0, `bars are links into the board (${view.barLinks.length} of them)`);
  ck(
    view.barLinks.some((h) => h.startsWith("/?publisher=")),
    "publisher bars link by ?publisher=",
  );
  // No date-range drill-through any more: the decade chart was the only chart
  // whose bars carried ?from=/?to=, and it was dropped for saying nothing about
  // a collection that's 98% one decade. Restoring it would mean adding per-year
  // hit targets to the release-year area chart — see ROADMAP.

  // Drill-through actually lands on the filtered board.
  const publisherBar = await p.evaluate(() => {
    const a = document.querySelector("main a[href^='/?publisher=']");
    if (!a) return null;
    const spans = a.querySelectorAll("span");
    return {
      href: a.getAttribute("href"),
      name: spans[0].textContent.trim(),
      count: Number(spans[spans.length - 1].textContent.trim()),
    };
  });
  ck(!!publisherBar, `found a publisher bar to drill through (${publisherBar?.name})`);

  if (publisherBar) {
    await p.evaluate(() => document.querySelector("main a[href^='/?publisher=']").click());
    await sleep(1400);
    const url = new URL(p.url());
    ck(url.pathname === "/", "clicking a bar lands back on the board");
    ck(
      url.searchParams.get("publisher") === publisherBar.name,
      `the board is filtered to that publisher (?publisher=${url.searchParams.get("publisher")})`,
    );
    const shown = await coverCount();
    ck(
      shown === publisherBar.count,
      `the board shows exactly the count the bar promised (${shown} vs ${publisherBar.count})`,
    );
  }

  // The rating histogram deliberately has no links — there's no rating filter to
  // send anyone to, and a bar that looks clickable but isn't is worse than a
  // plain one.
  await p.goto(`${BASE}/stats`, { waitUntil: "networkidle0" });
  await sleep(900);
  const ratingLinks = await p.evaluate(() => {
    const panel = [...document.querySelectorAll("main section")].find(
      (s) => s.querySelector("h2")?.textContent.trim() === "Ratings",
    );
    return panel ? panel.querySelectorAll("a").length : -1;
  });
  ck(ratingLinks === 0, `the rating histogram has no drill-through links (${ratingLinks})`);

  // Getting back to the covers must be obvious, and the strip must never be in
  // a zero-selection state. Two earlier attempts failed here: no strip at all
  // (a dead end), then a strip with nothing highlighted — which reads as broken
  // and, because every board tab carries a count, looks like a scope selector
  // for a page that is entirely counts.
  const backNav = await p.evaluate(() => {
    const strip = document.querySelector("div.sticky");
    const items = [...(strip?.querySelectorAll("a, button") ?? [])]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    const current = strip?.querySelector("[aria-current='page']");
    return {
      items,
      currentLabel: current?.textContent.trim() ?? null,
      // Exactly one item may claim to be the current view.
      currentCount: strip?.querySelectorAll("[aria-current='page']").length ?? -1,
      myComicsHref: [...(strip?.querySelectorAll("a") ?? [])]
        .find((a) => a.textContent.includes("My Comics"))
        ?.getAttribute("href"),
    };
  });
  ck(
    backNav.items.some((t) => t.startsWith("My Comics")),
    `the board tabs stay available on the stats page (${backNav.items.join(", ")})`,
  );
  ck(
    backNav.currentCount === 1 && backNav.currentLabel === "Stats",
    `exactly one item is highlighted, and it's Stats (${backNav.currentCount}: ${backNav.currentLabel})`,
  );
  ck(
    backNav.myComicsHref === "/",
    "My Comics is a real link, so it middle-clicks and reads as a destination",
  );

  await p.evaluate(() => {
    [...document.querySelectorAll("div.sticky a")]
      .find((a) => a.textContent.includes("My Comics"))
      ?.click();
  });
  await sleep(1400);
  ck(new URL(p.url()).pathname === "/", "clicking My Comics returns to the covers");
  const backHighlight = await p.evaluate(
    () => document.querySelector("div.sticky [aria-current='page']")?.textContent.trim() ?? null,
  );
  ck(
    backHighlight?.startsWith("My Comics") === true,
    `and the highlight moves back to My Comics (got ${backHighlight})`,
  );

  // The wordmark still works as a secondary way out.
  await p.goto(`${BASE}/stats`, { waitUntil: "networkidle0" });
  await sleep(900);
  await p.evaluate(() => document.querySelector("header a[href='/']").click());
  await sleep(1200);
  ck(new URL(p.url()).pathname === "/", "the wordmark navigates back to the board");

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
}
