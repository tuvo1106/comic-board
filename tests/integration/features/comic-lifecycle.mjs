import { BASE } from "../env.mjs";

// Upload: POST /api/comics (multipart) creates a comic owned by the user, with
// a generated thumbnail + dimensions; empty series and non-image files are
// rejected. Then exercises undo-delete (soft delete) on that same uploaded
// comic — kept in one file since both stages operate on the same record.
export async function uploadValidateDeleteUndo({ p, ck, sleep, apiJson, toastHasUndo }) {
  const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const beforeUpload = (await apiJson("/api/comics")).length;
  const up = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], "t.png", { type: "image/png" }));
    form.append(
      "meta",
      JSON.stringify({ series: "Uploaded Test", issueNumber: "99", publisher: "TestPub", authors: ["Test Author"], tags: ["uploaded"] }),
    );
    const r = await fetch("/api/comics", { method: "POST", body: form });
    return { status: r.status, body: await r.json() };
  }, PNG);
  ck(up.status === 201 && up.body.series === "Uploaded Test", `upload API creates a comic (status ${up.status})`);
  ck(
    !!up.body.thumbUrl && up.body.width > 0 && up.body.authors.includes("Test Author"),
    "uploaded comic has generated thumb + dimensions + metadata",
  );
  ck((await apiJson("/api/comics")).length === beforeUpload + 1, "comic count +1 after upload");
  const badStatus = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new File([bytes], "t.png", { type: "image/png" }));
    form.append("meta", JSON.stringify({ series: "" })); // empty series is invalid
    return (await fetch("/api/comics", { method: "POST", body: form })).status;
  }, PNG);
  ck(badStatus === 400, `empty series is rejected with 400 (got ${badStatus})`);
  // A non-image file (valid meta) is a client error -> 400, not a sharp 500 (item 6).
  const notImage = await p.evaluate(async () => {
    const form = new FormData();
    form.append("file", new File(["this is plain text, not an image"], "t.txt", { type: "text/plain" }));
    form.append("meta", JSON.stringify({ series: "Not An Image" }));
    const r = await fetch("/api/comics", { method: "POST", body: form });
    return { status: r.status, body: await r.json() };
  });
  ck(
    notImage.status === 400 && /valid image/i.test(notImage.body.error ?? ""),
    `non-image upload rejected with 400 (got ${notImage.status})`,
  );

  // Undo delete: deleting via the card menu shows an actionable "Undo" toast
  // (soft delete, not a hard remove); clicking it restores the comic. Search
  // down to just this card — it has no coverDate, so under the default sort
  // it can sink below the virtualization window and never mount.
  await p.goto(`${BASE}/?q=${encodeURIComponent("Uploaded Test")}`, { waitUntil: "networkidle0" });
  await sleep(700);
  const cardLabel = "Uploaded Test #99";
  await p.evaluate((label) => {
    const img = [...document.querySelectorAll("main img")].find((i) => i.alt === label);
    img.closest(".group").querySelector("div.absolute.right-2 button").click();
  }, cardLabel);
  await sleep(300);
  const [deleteMenuItem] = await p.$$("xpath/.//button[normalize-space(.)='Delete comic']");
  await deleteMenuItem.click();
  await sleep(300);
  const deletePersisted = p
    .waitForResponse(
      (r) => r.url().endsWith(`/api/comics/${up.body.id}`) && r.request().method() === "DELETE",
      { timeout: 10000 },
    )
    .catch(() => null);
  const [confirmDeleteBtn] = await p.$$("xpath/.//button[normalize-space(.)='Delete']");
  await confirmDeleteBtn.click();
  await deletePersisted;
  await sleep(400);

  const cardGoneAfterDelete = await p.evaluate(
    (label) => ![...document.querySelectorAll("main img")].some((i) => i.alt === label),
    cardLabel,
  );
  ck(cardGoneAfterDelete, "deleted comic disappears from the board immediately");
  ck(await toastHasUndo(), "delete shows an actionable 'Undo' toast");

  const restorePersisted = p
    .waitForResponse(
      (r) => r.url().endsWith(`/api/comics/${up.body.id}/restore`) && r.request().method() === "POST",
      { timeout: 10000 },
    )
    .catch(() => null);
  const [undoBtn] = await p.$$("xpath/.//button[normalize-space(.)='Undo']");
  await undoBtn.click();
  await restorePersisted;
  await sleep(500);

  const cardBackAfterUndo = await p.evaluate(
    (label) => [...document.querySelectorAll("main img")].some((i) => i.alt === label),
    cardLabel,
  );
  ck(cardBackAfterUndo, "clicking Undo restores the comic");

  await p.evaluate((id) => fetch(`/api/comics/${id}`, { method: "DELETE" }), up.body.id);
}
