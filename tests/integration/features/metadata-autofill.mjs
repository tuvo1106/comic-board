import { BASE } from "../env.mjs";

/**
 * Metron autofill panel (`MetadataSearch.tsx`) against a **stubbed** provider.
 *
 * Everything here is faked at the network boundary with
 * `page.setRequestInterception` — the same mechanism `board-tabs.mjs` uses to
 * force a 500. Nothing touches the real Metron API, which matters for more than
 * politeness: the panel self-hides unless a provider is configured and CI has no
 * `METRON_API_KEY`, so this flow was previously untestable and had zero UI
 * coverage despite being a headline feature. Stubbing is also strictly better
 * than the real thing here — deterministic, offline, no rate limit, and able to
 * drive states that are awkward to find on demand (a record with no covers, a
 * cover fetch that fails).
 *
 * Four routes are intercepted: the provider config (so the panel renders at
 * all), search, detail, and the cover byte proxy.
 */

// 1x1 PNG — enough for `loadCover` to build a Blob/File and an object URL.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const candidate = (over) => ({
  provider: "metron",
  ref: "stub-main",
  series: "Stub Detective Comics",
  issueNumber: "27",
  coverDate: "1939-05-01",
  publisher: "Stub Comics",
  coverThumbUrl: null, // null so no thumbnail image request needs stubbing
  year: 1937,
  issueCount: 3,
  ...over,
});

const SEARCH = {
  candidates: [
    candidate({}),
    candidate({ ref: "stub-empty", series: "Stub Coverless", issueNumber: "1", issueCount: 1 }),
    candidate({ ref: "stub-broken", series: "Stub Broken Cover", issueNumber: "2", issueCount: 1 }),
  ],
};

const DETAILS = {
  "stub-main": {
    series: "Stub Detective Comics",
    issueNumber: "27",
    publisher: "Stub Comics",
    coverDate: "1939-05-01",
    authors: ["Stub Writer"],
    artists: ["Stub Cover Artist"],
    covers: [
      { url: "https://stub.example/main.png", label: "Main cover" },
      { url: "https://stub.example/variant.png", label: "Second Printing Variant" },
    ],
  },
  "stub-empty": {
    series: "Stub Coverless",
    issueNumber: "1",
    publisher: "Stub Comics",
    coverDate: "2001-01-01",
    authors: [],
    artists: [],
    covers: [], // the case that used to wedge the loading state
  },
  "stub-broken": {
    series: "Stub Broken Cover",
    issueNumber: "2",
    publisher: "Stub Comics",
    coverDate: "2002-02-02",
    authors: [],
    artists: [],
    covers: [{ url: "https://stub.example/fail.png", label: "Main cover" }],
  },
};

export async function metadataAutofill({ p, ck, sleep }) {
  const json = (req, body) =>
    req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  const stub = (req) => {
    const url = req.url();
    // Provider config — without this the panel renders nothing at all.
    if (/\/api\/metadata(\?|$)/.test(url)) {
      return json(req, { providers: ["metron"], default: "metron" });
    }
    if (url.includes("/api/metadata/search")) return json(req, SEARCH);
    if (url.includes("/api/metadata/detail")) {
      const ref = new URL(url).searchParams.get("ref");
      return json(req, DETAILS[ref] ?? DETAILS["stub-main"]);
    }
    if (url.includes("/api/metadata/cover")) {
      const target = new URL(url).searchParams.get("url") ?? "";
      if (target.includes("fail")) {
        return req.respond({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Stubbed cover failure" }),
        });
      }
      return req.respond({ status: 200, contentType: "image/png", body: PNG });
    }
    // The variant strip renders the cover URLs directly as <img>.
    if (url.startsWith("https://stub.example/")) {
      return req.respond({ status: 200, contentType: "image/png", body: PNG });
    }
    return req.continue();
  };

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
  await p.setRequestInterception(true);
  p.on("request", stub);

  const clickByText = (text) =>
    p.evaluate((t) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t)?.click();
    }, text);
  const clickContaining = (text) =>
    p.evaluate((t) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes(t))?.click();
    }, text);
  const bodyHas = (text) => p.evaluate((t) => document.body.textContent.includes(t), text);
  const openAutofill = async () => {
    await clickByText("Add");
    await sleep(600);
    await p.type("input[placeholder^='Series and issue']", "stub");
    await clickByText("Search");
    await sleep(600);
  };

  try {
    await openAutofill();
    ck(
      (await p.$("input[placeholder^='Series and issue']")) !== null,
      "the autofill panel renders once a provider is configured",
    );
    const rows = await p.$$eval("ul li button p", (els) => els.map((e) => e.textContent.trim()));
    ck(
      rows.some((r) => r.includes("Stub Detective Comics")) && rows.some((r) => r.includes("(1937)")),
      `search results list the candidates with their series year (${rows[0] ?? "none"})`,
    );
    ck(
      rows.some((r) => r.includes("Stub Comics") && r.includes("#27") && r.includes("3 issues")),
      "each result shows publisher · issue · issue-count",
    );

    // --- Pick the record with two covers -----------------------------------
    await clickContaining("Stub Detective Comics");
    await sleep(900);
    ck(await bodyHas("Filled from Metron"), "picking a result toasts that the form was filled");
    ck(await bodyHas("Main cover"), "the picked card names the selected cover");
    ck(await bodyHas("2 covers"), "the variant strip appears when a record has more than one cover");
    const useDisabled = await p.$eval(
      "xpath/.//button[normalize-space(.)='Use this cover']",
      (el) => el.disabled,
    ).catch(() => null);
    ck(
      useDisabled === false && !(await bodyHas("Loading cover…")),
      "the cover finishes loading and 'Use this cover' becomes enabled",
    );

    // Switching variant reloads the cover and relabels it.
    await p.evaluate(() =>
      document.querySelector("button[title='Second Printing Variant']")?.click(),
    );
    await sleep(900);
    ck(
      await bodyHas("Second Printing Variant"),
      "choosing a variant relabels the selected cover",
    );

    // Committing the cover moves the modal into the details step, prefilled.
    await clickByText("Use this cover");
    await sleep(900);
    ck(await bodyHas("Add cover details"), "'Use this cover' advances to the details step");
    const prefilled = await p.evaluate(() => {
      const val = (labelText) => {
        const l = [...document.querySelectorAll("label")].find((x) =>
          x.textContent.trim().startsWith(labelText),
        );
        return l?.parentElement.querySelector("input")?.value ?? null;
      };
      return { series: val("Series"), issue: val("Issue"), publisher: val("Publisher") };
    });
    ck(
      prefilled.series === "Stub Detective Comics" && prefilled.issue === "27",
      `the form is prefilled from the provider record (series "${prefilled.series}", issue "${prefilled.issue}")`,
    );
    ck(
      prefilled.publisher === "Stub Comics",
      `publisher is prefilled too (got "${prefilled.publisher}")`,
    );
    await p.keyboard.press("Escape");
    await sleep(500);

    // --- A record with NO covers must not wedge the loading state ----------
    // Regression: the effect's early-return branch cleared `cover` but not
    // `coverLoading`, so this left "Loading cover…" on screen forever.
    await openAutofill();
    await clickContaining("Stub Coverless");
    await sleep(900);
    ck(
      await bodyHas("No cover available from this provider."),
      "a record with no covers says so",
    );
    ck(
      !(await bodyHas("Loading cover…")),
      "a record with no covers doesn't leave the cover spinner stuck",
    );
    ck(
      (await p.$("xpath/.//button[normalize-space(.)='Use this cover']")) === null,
      "no 'Use this cover' button when there is no cover",
    );
    await p.keyboard.press("Escape");
    await sleep(500);

    // --- A cover fetch that fails should toast, not hang ------------------
    await openAutofill();
    await clickContaining("Stub Broken Cover");
    await sleep(1200);
    ck(await bodyHas("Stubbed cover failure"), "a failed cover fetch surfaces the error as a toast");
    // Regression (found by this very test): the card keyed its message off
    // `coverLoading || !cover`, so a failed fetch — done loading, but `cover`
    // still null — showed "Loading cover…" indefinitely. The toast is transient,
    // so the panel was left permanently claiming to load something it had
    // already given up on.
    ck(
      !(await bodyHas("Loading cover…")),
      "a failed cover fetch stops claiming to be loading",
    );
    ck(
      await bodyHas("Couldn’t load this cover."),
      "a failed cover fetch says so persistently, not just via the toast",
    );
    await p.keyboard.press("Escape");
    await sleep(400);
  } finally {
    p.off("request", stub);
    await p.setRequestInterception(false);
    await p.goto(BASE, { waitUntil: "networkidle0" });
    await sleep(400);
  }
}
