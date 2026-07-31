import fs from "node:fs";
import path from "node:path";
import { BASE, DATA_DIR } from "../env.mjs";

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
  const PROVIDER_INPUT = "input[placeholder^='Series and issue']";
  const PROVIDER_OPTION = "#provider-series-suggestions [role='option']";
  const openModal = async () => {
    await clickByText("Add");
    await sleep(600);
  };
  const runSearch = async (q) => {
    await p.type(PROVIDER_INPUT, q);
    await clickByText("Search");
    await sleep(600);
  };
  const openAutofill = async () => {
    await openModal();
    await runSearch("stub");
  };

  try {
    // --- Series typeahead on the provider-search box ------------------------
    // Suggestions come from the local collection (/api/meta), not the provider:
    // the usual reason to be here is adding the next issue of a run you already
    // own. Series-only, since that's the grain the external API searches.
    await openModal();
    ck(
      (await p.$(PROVIDER_INPUT)) !== null,
      "the autofill panel renders once a provider is configured",
    );
    // Search is the default mode and the first thing you do here, so opening
    // Add and typing should just work. `Dialog` defers to a child's autoFocus
    // before falling back to focusing the panel itself — assert the caret
    // actually landed, since that ordering is what makes it work.
    ck(
      await p.evaluate(
        () =>
          document.activeElement ===
          document.querySelector("input[placeholder^='Series and issue']"),
      ),
      "opening Add puts the caret straight in the search box",
    );
    // And typing with no click first reaches it.
    await p.keyboard.type("zz");
    ck(
      (await p.$eval(PROVIDER_INPUT, (el) => el.value)) === "zz",
      "so typing immediately goes into the query box, no click needed",
    );
    await p.evaluate((s) => {
      const el = document.querySelector(s);
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, PROVIDER_INPUT);
    await sleep(200);
    await p.type(PROVIDER_INPUT, "abso", { delay: 30 });
    await sleep(400);
    const seriesRows = await p.$$eval(PROVIDER_OPTION, (els) =>
      els.map((el) => ({
        text: el.textContent.trim(),
        value: el.children[0]?.textContent.trim() ?? "",
        columns: el.children.length,
      })),
    );
    ck(
      seriesRows.some((r) => r.value === "Absolute Batman") &&
        seriesRows.some((r) => r.value === "Absolute Catwoman"),
      `the provider box suggests series from the collection (${seriesRows.map((r) => r.value).join(", ")})`,
    );
    ck(
      seriesRows.every((r) => r.columns === 2 && !/Series/.test(r.text)),
      "series-only rows omit the redundant field label, keeping just value + count",
    );

    // Regression: the list must escape the dialog, which is `overflow-hidden`
    // (it has to be, to clip its own rounded corners). Rendered in place it was
    // silently cut off at the panel edge — the first row sliced in half and the
    // rest invisible. Caught by looking at it; asserted here so it stays fixed.
    // `getBoundingClientRect` can't see overflow clipping, so the check is
    // structural: portalled to <body>, and extending past the panel's bottom
    // (which is exactly what would have been clipped before).
    const geometry = await p.evaluate(() => {
      const lb = document.getElementById("provider-series-suggestions");
      const panel = document.querySelector("[role='dialog']");
      // Must be the provider input specifically — the top-bar search box is also
      // a combobox and comes first in document order.
      const input = document.querySelector("input[placeholder^='Series and issue']");
      if (!lb || !panel || !input) return null;
      const lbBox = lb.getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const inputBox = input.getBoundingClientRect();
      return {
        portalled: lb.parentElement === document.body,
        insidePanel: panel.contains(lb),
        overhangsPanel: lbBox.bottom > panelBox.bottom,
        withinViewport: lbBox.top >= 0 && lbBox.bottom <= window.innerHeight + 1,
        leftDelta: Math.round(lbBox.left - inputBox.left),
        widthDelta: Math.round(lbBox.width - inputBox.width),
      };
    });
    ck(
      geometry?.portalled === true && geometry?.insidePanel === false,
      "the suggestion list portals out of the dialog instead of being clipped by it",
    );
    ck(
      geometry?.overhangsPanel === true,
      "it extends past the dialog panel's edge — the case that used to be cut off",
    );
    ck(geometry?.withinViewport === true, "and it still lands fully on screen");
    ck(
      Math.abs(geometry?.leftDelta ?? 99) <= 1 && Math.abs(geometry?.widthDelta ?? 99) <= 1,
      `a portalled list still tracks its input's box (left off by ${geometry?.leftDelta}px, width by ${geometry?.widthDelta}px)`,
    );

    // Escape must dismiss the dropdown WITHOUT closing the upload dialog, which
    // closes itself on a document-level Escape listener.
    await p.keyboard.press("Escape");
    await sleep(300);
    ck(
      (await p.$$(PROVIDER_OPTION)).length === 0 && (await p.$(PROVIDER_INPUT)) !== null,
      "Escape dismisses the suggestions without closing the upload dialog",
    );

    // Arrow + Enter picks, and must not submit the enclosing search form.
    await p.keyboard.press("ArrowDown");
    await sleep(250);
    ck((await p.$$(PROVIDER_OPTION)).length > 0, "ArrowDown re-opens the suggestions");
    await p.keyboard.press("ArrowDown");
    await sleep(150);
    await p.keyboard.press("Enter");
    await sleep(400);
    const afterPick = await p.$eval(PROVIDER_INPUT, (el) => el.value);
    ck(
      afterPick === "Absolute Batman ",
      `picking a series fills the box and leaves a trailing space for the issue (got "${afterPick}")`,
    );

    // Appending an issue number stops matching any series, so the list self-hides.
    await p.type(PROVIDER_INPUT, "23", { delay: 30 });
    await sleep(350);
    ck(
      (await p.$$(PROVIDER_OPTION)).length === 0,
      "once an issue number is typed the series list gets out of the way",
    );
    await p.keyboard.press("Escape"); // close the dialog; reopening resets it
    await sleep(500);

    // --- Provider search flow ----------------------------------------------
    await openAutofill();
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

    // --- Import the details WITHOUT the provider's image -------------------
    // Metron's variant coverage is community-contributed and patchy, so the
    // edition you actually own is often missing even when the record is right.
    // Before this the only way on was "Use this cover", so the choice was a
    // wrong image or nothing.
    await openAutofill();
    await clickContaining("Stub Detective Comics");
    await sleep(1200);
    ck(
      (await p.$("xpath/.//button[normalize-space(.)='Use this cover']")) !== null,
      "a record WITH covers still offers 'Use this cover'",
    );
    await clickContaining("Use details only");
    await sleep(700);

    const afterDetailsOnly = await p.evaluate(() => {
      const val = (label) => {
        const el = [...document.querySelectorAll("label")].find((l) =>
          l.textContent.trim().startsWith(label),
        );
        return el?.parentElement.querySelector("input")?.value ?? null;
      };
      const save = [...document.querySelectorAll("button")].find((b) =>
        /^Save cover$/.test(b.textContent.trim()),
      );
      return {
        series: val("Series"),
        issue: val("Issue"),
        publisher: val("Publisher"),
        // No provider image was taken, so nothing should be previewed yet.
        hasPreview: !!document.querySelector("img[alt='Preview']"),
        dropzone: document.body.textContent.includes("Add your cover"),
        saveDisabled: save ? save.disabled : null,
        hint: document.body.textContent.includes("Add a cover image"),
      };
    });
    ck(
      afterDetailsOnly.series === "Stub Detective Comics" && afterDetailsOnly.issue === "27",
      `details-only still prefills the form (series "${afterDetailsOnly.series}", issue "${afterDetailsOnly.issue}")`,
    );
    ck(
      afterDetailsOnly.publisher === "Stub Comics",
      `and the publisher too (got "${afterDetailsOnly.publisher}")`,
    );
    ck(!afterDetailsOnly.hasPreview, "no provider image was imported");
    ck(afterDetailsOnly.dropzone, "the details step offers a dropzone for your own image");
    ck(afterDetailsOnly.saveDisabled === true, "saving is blocked until an image is supplied");
    ck(afterDetailsOnly.hint, "and it says which requirement is outstanding");

    // The regression that made this feature necessary: `addFiles` used to reset
    // the form unconditionally, so supplying your own scan silently wiped every
    // field the provider had just filled in — which is precisely the manual
    // re-entry this is meant to remove.
    const tmpPng = path.join(DATA_DIR, "details-only-cover.png");
    fs.writeFileSync(
      tmpPng,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const dropInput = await p.$("input[type='file']");
    await dropInput.uploadFile(tmpPng);
    await sleep(900);

    const afterOwnImage = await p.evaluate(() => {
      const val = (label) => {
        const el = [...document.querySelectorAll("label")].find((l) =>
          l.textContent.trim().startsWith(label),
        );
        return el?.parentElement.querySelector("input")?.value ?? null;
      };
      const save = [...document.querySelectorAll("button")].find((b) =>
        /^Save cover$/.test(b.textContent.trim()),
      );
      return {
        series: val("Series"),
        issue: val("Issue"),
        hasPreview: !!document.querySelector("img[alt='Preview']"),
        saveDisabled: save ? save.disabled : null,
      };
    });
    ck(
      afterOwnImage.series === "Stub Detective Comics" && afterOwnImage.issue === "27",
      `adding your own image KEEPS the imported metadata (series "${afterOwnImage.series}")`,
    );
    ck(afterOwnImage.hasPreview, "your own image previews once added");
    ck(afterOwnImage.saveDisabled === false, "and saving unblocks");
    await p.keyboard.press("Escape");
    await sleep(500);

    // --- Swapping an ALREADY-IMPORTED cover for your own -------------------
    // The details step hosts its own copy of the search panel, so the real flow
    // is: import a provider cover, notice it's the wrong variant, search again,
    // and pick "I'll add my own image". `useDetailsOnly` only set a step we were
    // already on, so the first cover survived — and since the dropzone renders
    // only when there's no preview, there was no way to supply the replacement.
    // A dead end that read as the button doing nothing.
    const readDetailsStep = () =>
      p.evaluate(() => {
        const val = (label) => {
          const el = [...document.querySelectorAll("label")].find((l) =>
            l.textContent.trim().startsWith(label),
          );
          return el?.parentElement.querySelector("input")?.value ?? null;
        };
        const save = [...document.querySelectorAll("button")].find((b) =>
          /^Save cover$/.test(b.textContent.trim()),
        );
        return {
          series: val("Series"),
          hasPreview: !!document.querySelector("img[alt='Preview']"),
          dropzone: document.body.textContent.includes("Add your cover"),
          saveDisabled: save ? save.disabled : null,
        };
      });

    await openAutofill();
    await clickContaining("Stub Detective Comics");
    await sleep(1200);
    await clickByText("Use this cover");
    await sleep(900);
    ck((await readDetailsStep()).hasPreview, "an imported provider cover previews in the details step");

    // Search again from *inside* the details step, then take details only.
    await runSearch("stub");
    await clickContaining("Stub Detective Comics");
    await sleep(1200);
    await clickContaining("Use details only");
    await sleep(800);

    const afterSwap = await readDetailsStep();
    ck(!afterSwap.hasPreview, "'I'll add my own image' clears the already-imported cover");
    ck(afterSwap.dropzone, "and the dropzone returns so a replacement can be supplied");
    ck(
      afterSwap.series === "Stub Detective Comics",
      `while keeping the imported details (got "${afterSwap.series}")`,
    );
    ck(afterSwap.saveDisabled === true, "saving is blocked again until the replacement arrives");

    // The other half of the guard: a file the USER chose must survive the same
    // action. The provider only filled in fields around it, so discarding it
    // would throw away the one thing details-only exists to let you keep.
    const ownInput = await p.$("input[type='file']");
    await ownInput.uploadFile(tmpPng);
    await sleep(900);
    ck((await readDetailsStep()).hasPreview, "your own image previews after adding it");

    await runSearch("stub");
    await clickContaining("Stub Detective Comics");
    await sleep(1200);
    await clickContaining("Use details only");
    await sleep(800);
    const afterOwnKept = await readDetailsStep();
    ck(afterOwnKept.hasPreview, "details-only does NOT discard an image you supplied yourself");
    ck(afterOwnKept.saveDisabled === false, "so saving stays available");

    // --- Picking the wrong image must be recoverable -----------------------
    // The dropzone renders only when there's no preview, so before this the
    // first image you chose was the one you were stuck with: no way to clear or
    // swap it short of closing the modal, which loses the metadata too.
    ck(
      await p.evaluate(() =>
        [...document.querySelectorAll("label")].some((l) =>
          l.textContent.includes("Choose a different image"),
        ),
      ),
      "a previewed image offers a way to swap it",
    );

    // A visibly different second image, so "it changed" is checkable rather
    // than assumed — 2x2 red vs the 1x1 used above.
    const altPng = path.join(DATA_DIR, "replacement-cover.png");
    fs.writeFileSync(
      altPng,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
        "base64",
      ),
    );
    const beforeSwap = await p.$eval("img[alt='Preview']", (el) => el.naturalWidth);
    const replaceInput = await p.$("label input[type='file']");
    await replaceInput.uploadFile(altPng);
    await sleep(900);
    const afterSwap2 = await p.evaluate(() => {
      const img = document.querySelector("img[alt='Preview']");
      const save = [...document.querySelectorAll("button")].find((b) =>
        /^Save cover$/.test(b.textContent.trim()),
      );
      const el = [...document.querySelectorAll("label")].find((l) =>
        l.textContent.trim().startsWith("Series"),
      );
      return {
        width: img?.naturalWidth ?? null,
        series: el?.parentElement.querySelector("input")?.value ?? null,
        saveDisabled: save ? save.disabled : null,
      };
    });
    ck(
      afterSwap2.width !== beforeSwap && afterSwap2.width === 2,
      `choosing a different image actually replaces it (${beforeSwap}px -> ${afterSwap2.width}px)`,
    );
    ck(
      afterSwap2.series === "Stub Detective Comics",
      `and keeps the metadata (got "${afterSwap2.series}")`,
    );
    ck(afterSwap2.saveDisabled === false, "and saving stays available");
    await p.keyboard.press("Escape");
    await sleep(500);

    // Replacing one entry of a multi-file batch must swap only that entry —
    // `addFiles` starts a fresh queue, which would silently drop the rest.
    // No other test drives the modal's multi-file queue at all.
    await openModal();
    await clickContaining("Upload image");
    await sleep(300);
    const batchInput = await p.$("input[type='file']");
    await batchInput.uploadFile(tmpPng, altPng); // 1px then 2px
    await sleep(900);
    const batch = await p.evaluate(() => ({
      counter: [...document.querySelectorAll("p")]
        .map((n) => n.textContent.trim())
        .find((t) => /^\d+ of \d+$/.test(t)),
      width: document.querySelector("img[alt='Preview']")?.naturalWidth ?? null,
    }));
    ck(batch.counter === "1 of 2", `a multi-file batch queues them (got "${batch.counter}")`);
    ck(batch.width === 1, `and previews the first (${batch.width}px)`);

    const swapInput = await p.$("label input[type='file']");
    await swapInput.uploadFile(altPng);
    await sleep(900);
    const afterBatchSwap = await p.evaluate(() => ({
      counter: [...document.querySelectorAll("p")]
        .map((n) => n.textContent.trim())
        .find((t) => /^\d+ of \d+$/.test(t)),
      width: document.querySelector("img[alt='Preview']")?.naturalWidth ?? null,
    }));
    ck(
      afterBatchSwap.counter === "1 of 2",
      `swapping one entry leaves the queue intact (got "${afterBatchSwap.counter}")`,
    );
    ck(
      afterBatchSwap.width === 2,
      `while the current entry's image did change (${afterBatchSwap.width}px)`,
    );
    await p.keyboard.press("Escape");
    await sleep(500);

    // On a record with no covers at all, details-only is the only way forward,
    // so it takes over as the primary action instead of leaving a dead end.
    await openAutofill();
    await clickContaining("Stub Coverless");
    await sleep(900);
    await clickContaining("Use details, add my own image");
    await sleep(700);
    ck(
      await bodyHas("Add your cover"),
      "a coverless record can still be imported, straight to the dropzone",
    );
    ck(
      (await p.evaluate(() => {
        const el = [...document.querySelectorAll("label")].find((l) =>
          l.textContent.trim().startsWith("Series"),
        );
        return el?.parentElement.querySelector("input")?.value ?? null;
      })) === "Stub Coverless",
      "with its details carried through",
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
