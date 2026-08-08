# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

AGENTS.md already sets a rule for where documentation belongs — inline comment, `CHANGELOG.md`,
`ENGINEERING_NOTES.md`, or `ROADMAP.md` (see "Where a piece of documentation belongs"). None of
the four fit a decision made *during* implementation that's hard to reverse or rejected a
plausible alternative: it's not a shipped-and-done narrative (CHANGELOG), not a root-cause
lesson from a bug (ENGINEERING_NOTES), and not still-open work (ROADMAP). It has nowhere to
live, so it ends up nowhere — in a commit message, or not written down at all.

## Decision

Add `docs/adr/` as a fifth tier, for decisions specifically:

1. Inline comment — a durable fact about the code as it stands.
2. `CHANGELOG.md` — what shipped and why.
3. `ENGINEERING_NOTES.md` — root causes and durable lessons.
4. `ROADMAP.md` — what's still open.
5. **`docs/adr/`** — a decision made during implementation, hard to reverse or non-obvious to
   the next reader, that the other four don't fit.

Numbered sequentially, using `adr-template.md`. Immutable once accepted — supersede, don't edit.

## Alternatives considered

| Option | Why not |
|---|---|
| Fold into ENGINEERING_NOTES.md | That file is personal and narrative by design (see its own header) — a decision record needs a fixed shape (context/decision/alternatives/consequences), not prose. |
| Nothing, rely on git history | Answers "what changed," never "what else we tried and why it lost." |

## Consequences

Non-obvious decisions become reviewable in the PR that makes them. Small tax on judgment calls;
cheaper than losing the reasoning.
