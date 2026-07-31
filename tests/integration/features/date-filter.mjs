import { BASE } from "../env.mjs";

const FROM = "input[aria-label='Cover date from']";
const TO = "input[aria-label='Cover date to']";

/**
 * The cover-date range facet. Self-contained: opens from a clean board URL and
 * clears the filter before returning, so it can sit anywhere in the run order.
 *
 * Exists because of a real bug. A `type="date"` input reports a *complete*
 * value on nearly every keystroke in the year segment — typing "2020" yields
 * 0002, then 0020, 0202, 2020 — and filter state lives in the URL, where
 * `router.replace` resolves asynchronously. Binding the input straight to the
 * filter prop meant the first keystroke's `0002-01-15` came back mid-typing and
 * React wrote it into the field, wiping the half-typed year. The field visibly
 * reset itself, and a year-2 date is what got committed.
 *
 * The inter-keystroke `delay` below is load-bearing, not cosmetic: typing
 * instantly never gives the round-trip time to land mid-edit, which is the only
 * window in which the bug reproduces. Keep it.
 */
export async function dateRangeFilter({ p, ck, sleep, coverCount }) {
  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);

  // Idempotent: the pill toggles, so a blind click would *close* an already-open
  // popover and turn one failed assertion into a selector exception that aborts
  // the whole run.
  const openPopover = async (sel) => {
    if (await p.$(sel)) return;
    await p.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim().startsWith("Date"))
        ?.click();
    });
    await sleep(350);
  };

  const total = await coverCount();

  await openPopover(FROM);
  ck((await p.$(FROM)) !== null, "the Date facet opens a from/to pair");

  // --- the regression itself -----------------------------------------------
  await p.click(FROM);
  await p.type(FROM, "01152020", { delay: 80 });
  await sleep(900); // past the commit-settle delay

  const typed = await p.$eval(FROM, (el) => el.value);
  ck(typed === "2020-01-15", `typing a full date keeps every digit (got "${typed}")`);

  const qs = await p.evaluate(() => location.search);
  ck(qs.includes("from=2020-01-15"), `the committed filter matches what was typed (${qs})`);

  // --- and it actually filters ---------------------------------------------
  const filtered = await coverCount();
  ck(
    filtered !== null && filtered < total,
    `a from-date narrows the board (${filtered} of ${total})`,
  );

  // Every remaining cover really is on/after the cutoff.
  const allAfter = await p.evaluate(async () => {
    const list = await fetch("/api/comics").then((r) => r.json());
    return list
      .filter((c) => c.coverDate && c.coverDate >= "2020-01-15")
      .length;
  });
  ck(filtered === allAfter, `the count matches the data (${filtered} vs ${allAfter})`);

  // --- the second field, and that it doesn't disturb the first -------------
  // Derive the upper bound from live data rather than hardcoding a year. This
  // runs late in the suite, after earlier features have uploaded, deleted and
  // date-edited comics, so any fixed cutoff eventually stops splitting the set
  // — and a bound that excludes nothing makes the assertions below vacuous.
  const cutoff = await p.evaluate(async () => {
    const list = await fetch("/api/comics").then((r) => r.json());
    const dates = list
      .map((c) => c.coverDate)
      .filter(Boolean)
      .filter((d) => d >= "2020-01-15")
      .sort();
    // Median: guaranteed to leave comics on both sides of the bound.
    return dates.length > 1 ? dates[Math.floor(dates.length / 2)] : null;
  });
  ck(cutoff !== null, `found a cover date to bound the range at (${cutoff})`);
  const [cy, cm, cd] = cutoff.split("-");

  await openPopover(TO);
  await p.click(TO);
  await p.type(TO, `${cm}${cd}${cy}`, { delay: 80 });
  await sleep(900);

  const [fromVal, toVal] = await p.evaluate(
    (f, t) => [document.querySelector(f)?.value, document.querySelector(t)?.value],
    FROM,
    TO,
  );
  ck(toVal === cutoff, `the "to" field keeps every digit too (got "${toVal}")`);
  ck(fromVal === "2020-01-15", `filling "to" leaves "from" intact (got "${fromVal}")`);

  const ranged = await coverCount();
  const inRange = await p.evaluate(async (end) => {
    const list = await fetch("/api/comics").then((r) => r.json());
    return list.filter((c) => c.coverDate && c.coverDate >= "2020-01-15" && c.coverDate <= end)
      .length;
  }, cutoff);
  ck(ranged === inRange, `a both-ends range matches the data (${ranged} vs ${inRange})`);
  // Without this the pair above can agree at the unfiltered total and prove
  // nothing about the upper bound being applied at all.
  ck(
    ranged > 0 && ranged < filtered,
    `the upper bound excludes what the lower alone kept (${ranged} < ${filtered})`,
  );

  // --- clear restores the board -------------------------------------------
  await openPopover(FROM);
  await p.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Clear dates")
      ?.click();
  });
  await sleep(700);
  ck((await coverCount()) === total, "Clear dates restores the full board");
  ck(
    !(await p.evaluate(() => location.search)).includes("from="),
    "and drops the date params from the url",
  );
}
