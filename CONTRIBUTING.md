# Contributing

Solo project — these notes are for picking it back up later, human or agent.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, imperative, ≤72 chars.

Types: `feat` `fix` `docs` `refactor` `perf` `test` `build` `ci` `chore` `revert`.

No `Co-Authored-By` trailer.

## Before opening a PR

- Fill out the [PR template](.github/pull_request_template.md) — all four checks green, docs
  landed in the right tier (see AGENTS.md, "Where a piece of documentation belongs").
- A decision made during implementation that's hard to reverse, non-obvious, or reached by
  rejecting a plausible alternative gets an ADR in [docs/adr/](./docs/adr/) — see ADR-0001.

## Where things live

- [DESIGN.md](./DESIGN.md) — the spec.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — orientation: how a request travels.
- [docs/adr/](./docs/adr/) — decisions made during implementation.
- [CHANGELOG.md](./CHANGELOG.md) / [ROADMAP.md](./ROADMAP.md) / [ENGINEERING_NOTES.md](./ENGINEERING_NOTES.md) —
  see AGENTS.md's doc-placement rule for which one.
