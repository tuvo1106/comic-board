import { BASE } from "../env.mjs";

// List view: grid⇄list toggle renders rows; inline editing persists a field
// without wiping the row's other metadata; the date cell commits on blur
// (not per keystroke); sortable headers. Leaves the page in list view —
// bulk-actions.mjs (which runs right after) depends on that.
/**
 * The Size column: read-only pixel dimensions, sortable ascending so the
 * smallest covers — the ones worth upscaling — come first. Exists because
 * picking upscale candidates out of a 400-cover collection is a list-view job,
 * not something you can eyeball a cover at a time.
 */
export async function listViewSizeColumn({ p, ck, sleep }) {
  // Sorting is URL state, and the very next feature (bulk actions) selects rows
  // by position — leaving the board sorted by Size silently changed which
  // comics it picked. Capture and restore, so this sits anywhere in the run
  // order like the other self-contained features.
  const entryUrl = await p.evaluate(() => location.href);

  const sizes = () =>
    p.$$eval("div", (els) =>
      els
        .map((e) => e.textContent.trim())
        .filter((t) => /^\d{2,4}×\d{2,4}$/.test(t))
        .map((t) => t.split("×").map(Number)),
    );

  const shown = await sizes();
  ck(shown.length > 0, `the list shows each cover's pixel size (${shown.length} rows)`);

  // Sort by it and confirm the order is by total pixels, not width.
  await p.evaluate(() => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Size")?.click();
  });
  await sleep(700);
  const sorted = await sizes();
  const px = sorted.map(([w, h]) => w * h);
  ck(
    px.length > 1 && px.every((v, i) => i === 0 || px[i - 1] <= v),
    `sorting by Size puts the smallest first (${px[0]} … ${px[px.length - 1]} px)`,
  );

  await p.goto(entryUrl, { waitUntil: "networkidle0" });
  await sleep(600);
}

export async function listViewBasics({ p, ck, sleep, apiJson, imgs }, { N }) {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
  await (await p.$$("button[aria-label='List view']"))[0].click();
  await sleep(700);
  ck((await imgs()) === N, `list view renders all ${N} rows`);
  const rows = await apiJson("/api/comics");
  rows.sort((a, b) => (b.coverDate || "").localeCompare(a.coverDate || ""));
  const row0 = rows[0];
  await p.evaluate((pub) => {
    const cell = [...document.querySelectorAll("main button[title='Click to edit']")].find(
      (b) => b.textContent.trim() === pub,
    );
    cell?.click();
  }, row0.publisher);
  await sleep(300);
  await p.evaluate(() => {
    document.activeElement.value = "";
  });
  await p.keyboard.type("ListEdited");
  await p.keyboard.press("Enter");
  await sleep(700);
  const rowAfter = await apiJson(`/api/comics/${row0.id}`);
  ck(rowAfter.publisher === "ListEdited", "list view inline edit persists");
  ck(
    JSON.stringify(rowAfter.artists) === JSON.stringify(row0.artists),
    "list view inline edit keeps the row's other metadata",
  );
  // List-view date cell commits on blur, not per keystroke (item 7): editing the
  // value fires no PATCH; blurring fires exactly one.
  let datePatches = 0;
  const countDatePatch = (req) => {
    if (/\/api\/comics\/[^/]+$/.test(req.url()) && req.method() === "PATCH") datePatches++;
  };
  p.on("request", countDatePatch);
  await p.evaluate(() => {
    const el = document.querySelector("main input[type='date']");
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, "2019-07-04");
    el.dispatchEvent(new Event("input", { bubbles: true })); // React onChange -> setDraft only
  });
  await sleep(400);
  ck(datePatches === 0, `editing a date fires no PATCH before blur (got ${datePatches})`);
  await p.evaluate(() => document.querySelector("main input[type='date']").blur());
  await sleep(600);
  ck(datePatches === 1, `blurring the date commits exactly one PATCH (got ${datePatches})`);
  p.off("request", countDatePatch);

  // Sortable list-view headers: clicking "Series" sorts A→Z; clicking again flips Z→A.
  // Selected via `[data-list-table]`, not a Tailwind class: the container's
  // overflow classes are layout details that do change (making the header
  // sticky changed them), and a test shouldn't break because a style did.
  const seriesInDom = async () =>
    p.evaluate(() => {
      const wrap = document.querySelector("main [data-list-table] > div");
      return [...wrap.children]
        .slice(1) // drop the header row
        .map((r) => r.children[2]?.textContent.trim() ?? ""); // [checkbox, thumbnail, series]
    });
  const monotonic = (arr, up) =>
    arr.every((s, i) => i === 0 || (up ? arr[i - 1].localeCompare(s) <= 0 : arr[i - 1].localeCompare(s) >= 0));

  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), true), "clicking Series header sorts rows A→Z");
  await (await p.$$("button[title='Sort by Series']"))[0].click();
  await sleep(400);
  ck(monotonic(await seriesInDom(), false), "clicking Series header again flips to Z→A");
}
