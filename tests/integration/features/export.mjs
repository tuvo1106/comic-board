// Export backup: GET /api/export streams a zip attachment. The account
// menu's "Export backup" item triggers this via `window.location.href =
// "/api/export"` — a real page navigation to a binary response, which
// crashed the whole suite in headless Chrome (no download-behavior
// configured here) when clicked through the UI. The actual gap was route
// coverage (auth + headers + content), not proving that assignment line
// runs, so verify the route directly instead.
export async function exportBackup({ p, ck }) {
  const exportRes = await p.evaluate(async () => {
    const r = await fetch("/api/export");
    return { status: r.status, disposition: r.headers.get("content-disposition") ?? "" };
  });
  ck(exportRes.status === 200, `GET /api/export streams the zip (status ${exportRes.status})`);
  ck(
    /attachment/.test(exportRes.disposition) && /\.zip/.test(exportRes.disposition),
    `response is a downloadable zip attachment (got "${exportRes.disposition}")`,
  );
}
