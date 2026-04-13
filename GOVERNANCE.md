# Governance

## Maintainers

As of 2026-04-12, the repository is maintained by:

- `@poli-track-os`

## Decision model

- Maintainers are responsible for product direction, review decisions, release readiness, and moderation.
- Significant architecture, data, or governance changes should be discussed in an issue before implementation.
- When contributor and maintainer views differ, maintainers make the final merge decision.

## Merge policy

- `main` is the protected default branch.
- Changes should land through pull requests.
- Pull requests should pass CI before merge.
- Protected files should require code owner review.
- Emergency maintainer overrides should be rare and documented in the merge discussion.

## Planned GitHub enforcement

The hosted repository should enforce the following branch ruleset on `main`:

- Require a pull request before merging.
- Require at least 1 approving review.
- Require review from a code owner.
- Dismiss stale approvals when new commits are pushed.
- Require approval of the most recent reviewable push.
- Require status checks to pass before merging.
- Block force pushes.
- Restrict branch deletion.
- Require linear history.

These hosted settings are tracked in [`OPEN_SOURCE_TODO.md`](./OPEN_SOURCE_TODO.md).

The required status checks should be the `verify` job from `.github/workflows/ci.yml` and the `dependency-review` job from `.github/workflows/dependency-review.yml`.
