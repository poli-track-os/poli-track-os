# Contributing to Poli Track

Thanks for contributing. This repository is intentionally opinionated about review quality because the project deals with public-interest information and trust.

## Before you start

- Read [`README.md`](./README.md) for project scope and current limitations.
- Read [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) before participating.
- Check existing issues before opening a new one.
- For larger product or architecture changes, open an issue first so the direction can be discussed before code is written.

## Development setup

```bash
npm install
npm run dev
```

Required verification before you open a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Working agreement

- Do not push directly to `main`.
- Keep changes focused and reversible.
- Reuse nearby patterns before adding new abstractions.
- Update docs when behavior, contributor workflow, or project expectations change.
- Prefer small pull requests over broad mixed refactors.

## Pull request checklist

- The change has a clear user or maintainer outcome.
- The diff is scoped to one concern.
- Tests or verification steps cover the affected behavior.
- Screenshots are included for meaningful UI changes.
- Any follow-up work is captured in issues or the pull request description.

## Commit and branch guidance

- Use descriptive branch names such as `docs/readme-overhaul` or `fix/header-nav`.
- Keep commit messages specific enough to explain intent.
- Avoid mixing tooling, docs, and product changes unless they are tightly coupled.

## Review expectations

- At least one maintainer review should be required before merging.
- Changes that touch protected files should require the code owner approval defined in `CODEOWNERS`.
- New commits after review should address feedback directly rather than silently changing scope.

## Good first contributions

- Documentation fixes.
- Test coverage improvements.
- Accessibility improvements.
- Small UI bugs with clear reproduction steps.

## Security

If you believe you found a vulnerability, follow [`SECURITY.md`](./SECURITY.md) instead of opening a public issue.
