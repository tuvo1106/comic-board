// Add-to-board / remove-from-board via the card menu (BoardMembershipList) —
// shared by the grid card menu and the detail modal, tested once here.
export async function singleAddRemoveBoard({ p, ck, sleep, apiJson }) {
  const boardsForMenu = await apiJson("/api/boards");
  const targetBoard = boardsForMenu[0];
  if (!targetBoard) return;

  const cardLabel = await p.evaluate(() => document.querySelector("main img[src*='thumb.webp']").alt);
  await p.evaluate(() => {
    const img = document.querySelector("main img[src*='thumb.webp']");
    img.closest(".group.relative").querySelector("div.absolute.right-2 button").click();
  });
  await sleep(300);
  const findCard = async () => {
    const all = await apiJson("/api/comics");
    return all.find(
      (c) => `${c.series} ${c.issueNumber ? `#${c.issueNumber}` : ""}`.trim() === cardLabel,
    );
  };
  // A native DOM click (not Puppeteer's ElementHandle.click, which needs
  // a real CDP clickable-point) re-queried fresh each time — robust
  // against both the popover's own open animation and the toggle
  // mutation's refetch potentially replacing the button's DOM node.
  const clickBoardItem = () =>
    p.evaluate((name) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name)?.click();
    }, targetBoard.name);
  await clickBoardItem();
  await sleep(500);
  const afterAdd = await findCard();
  ck(
    !!afterAdd?.boardIds.includes(targetBoard.id),
    "card menu 'Add to board' adds the comic to that board",
  );
  // Same button toggles it back off — the menu doesn't close between
  // clicks (BoardMembershipList's toggle doesn't call a close()).
  await clickBoardItem();
  await sleep(500);
  const afterRemove = await findCard();
  ck(
    !afterRemove?.boardIds.includes(targetBoard.id),
    "clicking it again removes the comic from that board",
  );
  await p.keyboard.press("Escape");
  await sleep(300);
}
