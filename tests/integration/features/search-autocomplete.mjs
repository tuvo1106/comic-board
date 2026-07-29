import { BASE } from "../env.mjs";

const INPUT = "input[role='combobox']";
const OPTION = "#search-suggestions [role='option']";

/**
 * Search typeahead (item 2e). Self-contained: starts from a clean board URL and
 * leaves one behind, so it can sit anywhere in the run order.
 *
 * Uses "bat" as the probe term because the seed data carries it across two
 * different fields (series "Batman"/"Batwoman"/"Absolute Batman" and characters
 * "Batman"/"Batgirl"/"Batwoman") — which is exactly the grouped-suggestion case
 * worth covering — and because nothing earlier in the suite mutates it.
 */
export async function searchAutocomplete({ p, ck, sleep, coverCount }, { N }) {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);

  const readOptions = () =>
    p.$$eval(OPTION, (els) =>
      els.map((el) => ({
        value: el.children[0]?.textContent.trim() ?? "",
        label: el.children[1]?.textContent.trim() ?? "",
        count: el.children[2]?.textContent.trim() ?? "",
      })),
    );

  // No dropdown until there's a query.
  await p.click(INPUT);
  await sleep(200);
  ck((await p.$$(OPTION)).length === 0, "no suggestions shown for an empty query");

  await p.type(INPUT, "bat", { delay: 30 });
  await sleep(400);
  const opts = await readOptions();
  ck(opts.length > 0, `typing "bat" opens a suggestion dropdown (${opts.length} rows)`);
  ck(
    opts.every((o) => o.value.toLowerCase().includes("bat")),
    "every suggestion actually matches what was typed",
  );
  ck(
    opts.some((o) => o.label === "Series") && opts.some((o) => o.label === "Character"),
    `suggestions are labelled by field, across more than one (${[...new Set(opts.map((o) => o.label))].join(", ")})`,
  );
  ck(
    opts.every((o) => /^\d+$/.test(o.count)),
    "each suggestion shows how many comics carry it",
  );
  // Every row must be a distinct search. "Batman" is both a series and a
  // character in the seed data, and under free-text search both rows would run
  // the identical query — so they collapse to one (character wins).
  const values = opts.map((o) => o.value.toLowerCase());
  ck(
    new Set(values).size === values.length,
    `no duplicate values across fields (${values.length} rows, ${new Set(values).size} distinct)`,
  );
  ck(
    opts.find((o) => o.value === "Batman")?.label === "Character",
    `a name that is both a series and a character shows as Character (got ${opts.find((o) => o.value === "Batman")?.label})`,
  );
  ck(opts.length <= 5, `the list is capped at 5 rows (got ${opts.length})`);
  // Prefix matches rank above mid-string ones: "Batman" before "Absolute Batman".
  const prefixed = opts.findIndex((o) => o.value.toLowerCase().startsWith("bat"));
  const midString = opts.findIndex((o) => !o.value.toLowerCase().startsWith("bat"));
  ck(
    prefixed === 0 && (midString === -1 || midString > prefixed),
    "prefix matches are ranked above mid-string matches",
  );

  // Escape hides the dropdown but keeps what was typed.
  await p.keyboard.press("Escape");
  await sleep(250);
  ck(
    (await p.$$(OPTION)).length === 0 &&
      (await p.$eval(INPUT, (el) => el.value)) === "bat",
    "Escape dismisses the dropdown without clearing the query",
  );

  // Arrow keys re-open it, and Enter picks the highlighted row.
  await p.keyboard.press("ArrowDown");
  await sleep(250);
  const reopened = await readOptions();
  ck(reopened.length > 0, "ArrowDown re-opens the dropdown after Escape");
  await p.keyboard.press("ArrowDown");
  await sleep(150);
  const highlighted = await p.$$eval(OPTION, (els) => {
    const i = els.findIndex((el) => el.getAttribute("aria-selected") === "true");
    return { i, value: els[i]?.children[0]?.textContent.trim() ?? null };
  });
  ck(highlighted.i === 0, `ArrowDown highlights the first row (index ${highlighted.i})`);
  await p.keyboard.press("Enter");
  await sleep(800);
  ck(
    (await p.$eval(INPUT, (el) => el.value)) === highlighted.value,
    `Enter fills the search box with the highlighted suggestion ("${highlighted.value}")`,
  );
  const afterPick = await coverCount();
  ck(
    afterPick > 0 && afterPick < N,
    `picking a suggestion filters the board to a subset (${afterPick} of ${N})`,
  );
  ck(
    new URL(p.url()).searchParams.get("q") === highlighted.value,
    "the picked term lands in the URL's ?q= (a shareable search, not just local state)",
  );

  // Clicking a suggestion works the same way as Enter.
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);
  await p.click(INPUT);
  await p.type(INPUT, "batw", { delay: 30 });
  await sleep(400);
  const clickTarget = (await readOptions())[0];
  ck(!!clickTarget, `typing "batw" still suggests (${clickTarget?.value ?? "none"})`);
  if (clickTarget) {
    await p.evaluate((sel) => document.querySelector(sel)?.click(), OPTION);
    await sleep(800);
    ck(
      (await p.$eval(INPUT, (el) => el.value)) === clickTarget.value,
      "clicking a suggestion fills the search box too",
    );
    ck(
      (await p.$$(OPTION)).length === 0,
      "the dropdown closes once a suggestion is picked",
    );
  }

  // A term that matches nothing suggests nothing (and doesn't error).
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(600);
  await p.click(INPUT);
  await p.type(INPUT, "zzzznope", { delay: 20 });
  await sleep(400);
  ck((await p.$$(OPTION)).length === 0, "a term matching nothing shows no suggestions");

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
}
