import { BASE } from "../env.mjs";

// Multi-select + bulk actions (item 2a), list view only. Precondition: the
// page is already in list view (left there by list-view.mjs's
// listViewBasics). `labels[0]` is the header "select all"; labels[1..] are
// each row's checkbox, DOM order. Ends by switching back to grid view.
export async function bulkActions({ p, ck, sleep, apiJson }) {
  const labels = await p.$$("main [data-list-table] label");
  await labels[1].click();
  await p.keyboard.down("Shift");
  await labels[3].click(); // range-select rows 0-2
  await p.keyboard.up("Shift");
  await sleep(300);
  const selectedText = await p.evaluate(() => document.body.textContent.match(/(\d+) selected/)?.[1]);
  ck(selectedText === "3", `shift-click range-selects 3 rows (got ${selectedText})`);

  // Aggregate counts, not per-row identity — the seed data has duplicate
  // series names (e.g. two "Absolute Batman" issues), so matching DOM rows
  // back to specific API records by name would be ambiguous. Counting a
  // pre-existing tag before/after is still a real regression check: if the
  // bulk action overwrote each comic's tags instead of unioning into them
  // (item 2a's tag-union decision), any selected comic that already had
  // this tag would lose it, and the count would drop.
  const countWithTag = (comics, tag) => comics.filter((c) => c.tags.includes(tag)).length;
  const before = await apiJson("/api/comics");
  const variantBefore = countWithTag(before, "Variant");

  const [addTagBtn] = await p.$$("xpath/.//button[normalize-space(.)='Add tag']");
  await addTagBtn.click();
  await sleep(300);
  await p.keyboard.type("BulkTagXYZ");
  await p.keyboard.press("Enter");
  await sleep(600);
  const after = await apiJson("/api/comics");
  ck(countWithTag(after, "BulkTagXYZ") === 3, "bulk 'Add tag' applies the new tag to all 3 selected");
  ck(
    countWithTag(after, "Variant") === variantBefore,
    "bulk 'Add tag' doesn't wipe an existing tag on comics that already had one (union, not overwrite)",
  );

  await bulkBoardMembership({ p, ck, sleep, apiJson });

  // A successful bulk action clears the selection (onDone), so the bar from
  // "Add tag" above is already gone — re-select before testing Delete.
  const labels2 = await p.$$("main [data-list-table] label");
  await labels2[1].click();
  await p.keyboard.down("Shift");
  await labels2[3].click();
  await p.keyboard.up("Shift");
  await sleep(300);

  // Bulk delete (soft) + Undo restores all of them, mirroring single-delete.
  // The bar's own "Delete" trigger stays mounted behind the confirm dialog,
  // so a second query for "Delete" matches both — the dialog's button (in
  // a document.body portal) comes last in document order, so take the last
  // match rather than the first.
  const beforeCount = (await apiJson("/api/comics")).length;
  const [deleteBtn] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
  await deleteBtn.click();
  await sleep(300);
  const deleteMatches = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
  await deleteMatches[deleteMatches.length - 1].click();
  await sleep(600);
  ck(
    (await apiJson("/api/comics")).length === beforeCount - 3,
    "bulk delete removes all 3 selected comics",
  );
  const toastHasUndo = await p.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Undo"),
  );
  ck(toastHasUndo, "bulk delete shows an actionable 'Undo' toast");
  const [undoBtn] = await p.$$("xpath/.//button[normalize-space(.)='Undo']");
  await undoBtn.click();
  await sleep(600);
  ck(
    (await apiJson("/api/comics")).length === beforeCount,
    "clicking Undo restores all 3 bulk-deleted comics",
  );

  await (await p.$$("button[aria-label='Grid view']"))[0].click();
  await sleep(400);
}

// Bulk add-to-board / remove-from-board. Counts, not per-row identity — same
// reasoning as the tag check above. `boards[i].count` already exists on the
// API response, so this doesn't need its own lookup.
async function bulkBoardMembership({ p, ck, sleep, apiJson }) {
  const boardsList = await apiJson("/api/boards");
  const targetBoard = boardsList[0];
  if (!targetBoard) return;

  const countBefore = boardsList.find((b) => b.id === targetBoard.id).count;
  // A later test ("custom board defaults to Manual sort") reuses this
  // same board and needs it non-empty — BoardView shows an EmptyBoard
  // state (no toolbar, no sort selector) once a board hits 0 comics
  // (BoardView.tsx:128). Capture original membership so it can be
  // restored after this test empties the board.
  const originalMemberIds = (await apiJson("/api/comics"))
    .filter((c) => c.boardIds.includes(targetBoard.id))
    .map((c) => c.id);

  const boardLabels1 = await p.$$("main [data-list-table] label");
  await boardLabels1[1].click();
  await p.keyboard.down("Shift");
  await boardLabels1[3].click();
  await p.keyboard.up("Shift");
  await sleep(300);

  const [addToBoardBtn] = await p.$$("xpath/.//button[normalize-space(.)='Add to board']");
  await addToBoardBtn.click();
  await sleep(300);
  // Native DOM click (not Puppeteer's ElementHandle.click) — this button
  // is inside an animated popover, same clickable-point flakiness as the
  // card-menu case above.
  await p.evaluate((name) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === name)?.click();
  }, targetBoard.name);
  await sleep(600);
  const countAfterAdd = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
  ck(
    countAfterAdd === countBefore + 3,
    `bulk 'Add to board' adds all 3 selected (count ${countBefore} -> ${countAfterAdd})`,
  );

  // "Remove from board" only shows while viewing that specific board (not
  // My Comics) — go there, select everything on it, and clear it out.
  await p.goto(`${BASE}/board/${targetBoard.id}`, { waitUntil: "networkidle0" });
  await sleep(600);
  await (await p.$$("button[aria-label='List view']"))[0].click();
  await sleep(600);
  const boardLabels2 = await p.$$("main [data-list-table] label");
  await boardLabels2[0].click(); // header "select all"
  await sleep(300);
  const [removeBtn] = await p.$$("xpath/.//button[normalize-space(.)='Remove from board']");
  await removeBtn.click();
  await sleep(700);
  const countAfterRemove = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
  ck(countAfterRemove === 0, `bulk 'Remove from board' clears the board (count -> ${countAfterRemove})`);

  // Restore original membership (see comment above) via direct API calls
  // — this is cleanup, not the thing under test, so no need to go
  // through the UI again.
  for (const id of originalMemberIds) {
    await p.evaluate(
      ({ boardId, comicId }) =>
        fetch(`/api/boards/${boardId}/comics/${comicId}`, { method: "PUT" }),
      { boardId: targetBoard.id, comicId: id },
    );
  }
  const countAfterRestore = (await apiJson("/api/boards")).find((b) => b.id === targetBoard.id).count;
  ck(
    countAfterRestore === countBefore,
    `restores the board's original ${countBefore} members after the test (got ${countAfterRestore})`,
  );

  await p.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(500);
  await (await p.$$("button[aria-label='List view']"))[0].click();
  await sleep(600);
}
