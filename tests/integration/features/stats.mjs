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

  // Reachable from the board, without hunting for it in a menu.
  const navHref = await p.evaluate(
    () => document.querySelector("header a[href='/stats']")?.getAttribute("href") ?? null,
  );
  ck(navHref === "/stats", "the board's top bar links to the stats page");

  await p.evaluate(() => document.querySelector("header a[href='/stats']").click());
  await sleep(1200);
  ck(new URL(p.url()).pathname === "/stats", `the Stats link navigates there (at ${p.url()})`);

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
  for (const title of ["By publisher", "By decade", "Ratings", "By release year"]) {
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
  ck(
    view.barLinks.some((h) => h.includes("from=") && h.includes("to=")),
    "decade bars link by a ?from=/?to= date range",
  );

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

  // Getting back to the covers must be obvious. The page originally rendered
  // without the board tab strip — on the reasoning that tabs are board chrome
  // and stats isn't a board — which stripped the app's primary navigation and
  // left only the wordmark (which doesn't read as clickable) and a "Stats"
  // button that silently pointed home once you were already there.
  const backNav = await p.evaluate(() => {
    const strip = document.querySelector("div.sticky");
    const tabs = [...(strip?.querySelectorAll("button") ?? [])]
      .map((b) => b.textContent.trim())
      .filter(Boolean);
    return {
      tabs,
      // Nothing in the strip should claim to be the view you're looking at.
      activeIndicators: strip ? strip.querySelectorAll(".bg-accent").length : -1,
      statsHref: document.querySelector("header a[href='/stats']")?.getAttribute("href") ?? null,
    };
  });
  ck(
    backNav.tabs.some((t) => t.startsWith("My Comics")),
    `the board tabs stay available on the stats page (${backNav.tabs.join(", ")})`,
  );
  ck(
    backNav.activeIndicators === 0,
    `but no tab is highlighted, since none of them is the current view (${backNav.activeIndicators})`,
  );
  ck(
    backNav.statsHref === "/stats",
    "the Stats control keeps pointing at /stats instead of flipping to a back button",
  );

  await p.evaluate(() => {
    [...document.querySelectorAll("div.sticky button")]
      .find((b) => b.textContent.includes("My Comics"))
      ?.click();
  });
  await sleep(1400);
  ck(new URL(p.url()).pathname === "/", "clicking My Comics returns to the covers");

  // The wordmark still works as a secondary way out.
  await p.goto(`${BASE}/stats`, { waitUntil: "networkidle0" });
  await sleep(900);
  await p.evaluate(() => document.querySelector("header a[href='/']").click());
  await sleep(1200);
  ck(new URL(p.url()).pathname === "/", "the wordmark navigates back to the board");

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
}
