<!--
Keep this short. The narrative — alternatives considered, tradeoffs accepted,
measurements taken — belongs in CHANGELOG.md, not here (see AGENTS.md, "Where a
piece of documentation belongs"). This is just what changed and how it was
checked.
-->

## What changed

<!-- One or two sentences. What does the app do now that it didn't before? -->

## Why

<!-- The problem this solves. Link the ROADMAP.md item if it has one. -->

## Verification

All four are green on this branch:

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` — whole suite, not just the changed file's subset
- [ ] `npm run test:integration` — browser E2E (needs port 3940 free)

<!-- If any is skipped, say which and why. If a check was slow or flaky, say so. -->

**Checked in a real browser:** <!-- yes / no / n.a. — see the browser-check
skill or the throwaway-instance recipe in AGENTS.md. Never point a manual run at
the dev database. -->

## Docs

- [ ] `CHANGELOG.md` — what shipped and why (required for anything user-visible)
- [ ] `ROADMAP.md` — a finished item collapses to one line + `→ CHANGELOG.md`
- [ ] `DESIGN.md` / `README.md` / `AGENTS.md` — only if behaviour or workflow moved
- [ ] New decisions recorded as an ADR (`docs/adr/`)
- [ ] Nothing landed in the wrong tier (a debugging story in a code comment, a
      shipped feature still written up in ROADMAP)

## Notes for review

<!-- Anything deliberately left out, follow-ups worth filing, or a decision
you'd like a second opinion on. Delete if there's nothing. -->
