/**
 * Integration tests: drive the real app in a headless browser against an
 * ISOLATED test database (never the dev/user data). Covers the flows that unit
 * tests can't — the ones behind the bugs we actually hit: client-side filter
 * rendering, board-scoped facet counts, drag-reorder persistence, the detail
 * modal, edit persistence, per-board sort defaults, and portal'd overlays.
 *
 *   npm run test:integration
 *
 * Spins up its own Next dev server on port 3940 with a throwaway sqlite db under
 * ./data/test, seeded from ./images, and tears it all down at the end.
 *
 * This file only owns environment setup/teardown and the run order — the test
 * logic itself lives in tests/integration/features/*.mjs, one file per feature
 * area. Order below is not arbitrary: later features depend on state earlier
 * ones leave behind (detail-modal's `cid`, board-view's `N`, list-view leaving
 * the page in list view for bulk-actions to continue from).
 */
import { fails, ck, env, sleep } from "./integration/env.mjs";
import {
  buildAndSeed,
  startServer,
  launchBrowser,
  teardown,
  installSignalTeardown,
} from "./integration/lifecycle.mjs";
import { makeHelpers } from "./integration/helpers.mjs";

import { loginAsSeed, signUpFlow, staleCookieLoop } from "./integration/features/auth.mjs";
import { changeEmailAndPassword } from "./integration/features/account-settings.mjs";
import { exportBackup } from "./integration/features/export.mjs";
import {
  boardCountsAndVirtualization,
  filterAndFacets,
  renamePublisherRoundTrip,
  dragReorderPersists,
  modalPreservesBoardFilter,
} from "./integration/features/board-view.mjs";
import { detailModalAndCoverFlows } from "./integration/features/detail-modal.mjs";
import { singleAddRemoveBoard } from "./integration/features/board-membership.mjs";
import { uploadValidateDeleteUndo } from "./integration/features/comic-lifecycle.mjs";
import { listViewBasics } from "./integration/features/list-view.mjs";
import { bulkActions } from "./integration/features/bulk-actions.mjs";
import { boardTabsAndReorder } from "./integration/features/board-tabs.mjs";

await buildAndSeed();
const server = startServer();
let browser;
installSignalTeardown(() => ({ server, browser }));
try {
  const launched = await launchBrowser(server);
  browser = launched.browser;
  const p = launched.p;
  const ctx = { p, ck, env, sleep, ...makeHelpers(p) };

  await loginAsSeed(ctx);
  await changeEmailAndPassword(ctx);
  await exportBackup(ctx);
  await signUpFlow(ctx);

  const { N } = await boardCountsAndVirtualization(ctx);
  const { dcCount } = await filterAndFacets(ctx, { N });
  await renamePublisherRoundTrip(ctx, { dcCount });
  await dragReorderPersists(ctx);
  await modalPreservesBoardFilter(ctx);

  await detailModalAndCoverFlows(ctx);
  await singleAddRemoveBoard(ctx);
  await uploadValidateDeleteUndo(ctx);

  await listViewBasics(ctx, { N });
  await bulkActions(ctx);
  await boardTabsAndReorder(ctx);

  await staleCookieLoop(ctx);

  console.log(`\n==== INTEGRATION: ${fails.length ? `${fails.length} FAILED` : "ALL PASSED"} ====`);
} catch (e) {
  console.error("ERROR:", e.message);
  fails.push("exception: " + e.message);
} finally {
  await teardown({ server, browser });
}

process.exit(fails.length ? 1 : 0);
