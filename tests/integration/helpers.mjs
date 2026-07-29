// Page-level helpers shared across feature files. Built from a live `p`
// (Puppeteer page) rather than imported standalone, since every one of them
// closes over the same page instance.
export function makeHelpers(p) {
  // Authenticated fetches must run in the browser (which holds the session cookie).
  const apiJson = (path) => p.evaluate((pth) => fetch(pth).then((r) => r.json()), path);

  const imgs = () => p.$$eval("main img[src*='thumb.webp']", (e) => e.length);

  // The board's "N covers" counter reflects the full (filtered) dataset, unlike
  // the mounted <img> count, which is a windowed subset now that the masonry is
  // virtualized. Use it whenever we mean "how much data is on this board".
  const coverCount = () =>
    p.evaluate(() => {
      const el = [...document.querySelectorAll("p")].find((n) =>
        /^\d+\s+covers?$/.test(n.textContent.trim()),
      );
      return el ? Number(el.textContent.trim().match(/^(\d+)/)[1]) : null;
    });

  const sortLabel = () =>
    p.evaluate(() =>
      [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => t && t.includes("Sort:")),
    );

  // Native DOM click (not Puppeteer's ElementHandle.click, which requires a
  // real CDP clickable-point) re-queried fresh each time — robust against
  // both an animated popover's open transition and a mutation-triggered
  // refetch replacing the target button's DOM node between calls.
  const clickButtonByText = (text) =>
    p.evaluate((t) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t)?.click();
    }, text);

  // The account-menu trigger's visible text is just an initial letter — the
  // email only lives in its `title` attribute.
  const openAccountMenu = (email) =>
    p.evaluate((e) => document.querySelector(`button[title='${e}']`)?.click(), email);

  const toastSays = (text) => p.evaluate((t) => document.body.textContent.includes(t), text);

  const toastHasUndo = () =>
    p.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo"),
    );

  return {
    apiJson,
    imgs,
    coverCount,
    sortLabel,
    clickButtonByText,
    openAccountMenu,
    toastSays,
    toastHasUndo,
  };
}
