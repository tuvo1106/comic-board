import { BASE } from "../env.mjs";

// Custom board defaults to Manual sort; tab "…" menu and dialogs render in a
// portal (not clipped); a failed rename shows an error toast and leaves the
// dialog open; drag tabs to reorder boards (same swap semantics as card
// reorder, on boards.tabPosition instead of comics.position).
export async function boardTabsAndReorder({ p, ck, sleep, apiJson, sortLabel }) {
  const boards = await apiJson("/api/boards");
  if (boards[0]) {
    await p.goto(`${BASE}/board/${boards[0].id}`, { waitUntil: "networkidle0" });
    await sleep(700);
    ck(/Manual order/.test(await sortLabel()), "custom board defaults to Manual sort");

    // Tab "…" menu renders in a portal (not clipped).
    await p.evaluate((name) => {
      const t = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("group") && d.textContent.includes(name) && d.querySelector("button svg"),
      );
      const dot = [...t.querySelectorAll("button")].find((b) => b.querySelector("svg") && !b.textContent.includes(name));
      dot.click();
    }, boards[0].name);
    await sleep(300);
    const menuItems = await p.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => /Rename|Delete/.test(b.textContent) && b.offsetParent !== null)
        .map((b) => b.textContent.trim()),
    );
    ck(menuItems.includes("Rename") && menuItems.includes("Delete"), "tab menu shows Rename + Delete (portal, unclipped)");

    // Delete-board dialog is centered in the viewport (portal), not clipped.
    const [del] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
    await del.click();
    await sleep(400);
    const box = await p.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find((x) => /Delete board/.test(x.textContent));
      const panel = h.closest("div.relative");
      const r = panel.getBoundingClientRect();
      return { top: r.top, centeredOffset: Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2) };
    });
    ck(box.top > 0 && box.centeredOffset < 60, `delete-board dialog centered, not cut off (top ${Math.round(box.top)})`);

    // A failed rename shows an error toast and leaves the dialog open (item 4).
    // Re-navigate to reset overlay state, then stub the board PATCH as a 500.
    await p.goto(`${BASE}/board/${boards[0].id}`, { waitUntil: "networkidle0" });
    await sleep(600);
    await p.setRequestInterception(true);
    const stub500 = (req) => {
      if (/\/api\/boards\/[^/]+$/.test(req.url()) && req.method() === "PATCH") {
        req.respond({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Stubbed board failure" }),
        });
      } else {
        req.continue();
      }
    };
    p.on("request", stub500);

    // Open the tab "…" menu → Rename.
    await p.evaluate((name) => {
      const t = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("group") && d.textContent.includes(name) && d.querySelector("button svg"),
      );
      const dot = [...t.querySelectorAll("button")].find((b) => b.querySelector("svg") && !b.textContent.includes(name));
      dot.click();
    }, boards[0].name);
    await sleep(300);
    const [rename] = await p.$$("xpath/.//button[normalize-space(.)='Rename']");
    await rename.click();
    await sleep(300);

    // Edit the name and Save → hits the stubbed 500.
    await p.keyboard.type(" Renamed");
    const [save] = await p.$$("xpath/.//button[normalize-space(.)='Save']");
    await save.click();
    await sleep(600);

    const renameStillOpen = await p.evaluate(() =>
      [...document.querySelectorAll("h2")].some((x) => /Rename board/.test(x.textContent)),
    );
    const errToast = await p.evaluate(() => document.body.textContent.includes("Stubbed board failure"));
    ck(renameStillOpen, "failed rename leaves the rename dialog open");
    ck(errToast, "failed rename shows an error toast");

    p.off("request", stub500);
    await p.setRequestInterception(false);
  }

  if (boards[0] && boards[1]) {
    await p.goto(BASE, { waitUntil: "networkidle0" });
    await sleep(700);
    const tabBox = async (name) =>
      p.evaluate((n) => {
        const t = [...document.querySelectorAll("div")].find(
          (d) => d.className.includes("group") && d.textContent.includes(n) && d.querySelector("button svg"),
        );
        const r = t.getBoundingClientRect();
        return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      }, name);
    const boxA = await tabBox(boards[0].name);
    const boxB = await tabBox(boards[1].name);
    const beforeAFirst = boxA.cx < boxB.cx;

    await p.mouse.move(boxA.cx, boxA.cy);
    await p.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await p.mouse.move(boxA.cx + ((boxB.cx - boxA.cx) * i) / 14, boxA.cy + ((boxB.cy - boxA.cy) * i) / 14);
      await sleep(20);
    }
    await sleep(200);
    const tabPosPersisted = p
      .waitForResponse(
        (r) => /\/api\/boards\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
        { timeout: 10000 },
      )
      .catch(() => null);
    await p.mouse.up();
    await tabPosPersisted;
    await sleep(400);

    const afterA = await tabBox(boards[0].name);
    const afterB = await tabBox(boards[1].name);
    const afterAFirst = afterA.cx < afterB.cx;
    ck(afterAFirst !== beforeAFirst, "dragging a tab onto another swaps their order");

    await p.goto(BASE, { waitUntil: "networkidle0" });
    await sleep(700);
    const reloadA = await tabBox(boards[0].name);
    const reloadB = await tabBox(boards[1].name);
    ck((reloadA.cx < reloadB.cx) === afterAFirst, "tab reorder persists across reload");
  }
}
