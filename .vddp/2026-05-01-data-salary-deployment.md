# Data Salary Deployment Fix

Profile: ENGINEERING

## Orient

Success criteria:
- Public data page salary charts include role-level office compensation as well as personal salary disclosures.
- Salary source chart does not expose a misleading Unknown bucket when a better fallback exists.
- Branch is merged to main and pushed so GitHub Pages can deploy the corrected bundle.

Failure criteria:
- `/data` still aggregates only `politician_finances.annual_salary`.
- Checks fail, or deployment branch remains separate from `main`.

First verification step:
- `npm test -- src/test/data-observatory.test.ts`

## TODO Triage

TODO: Build salary analytics from personal finance salary rows and latest role-level office pay rows.
1. Gold standard: one tested aggregation helper that accepts both row types, ignores invalid amounts, buckets by EUR-comparable salary, and labels sources without Unknown.
2. Existing code: salary buckets and source aggregation existed locally in `use-data-observatory.ts`, but only for personal finance rows.
3. Online source check: not required; this is local data shaping, not external API behavior.
4. Literature check: not required; no research/theory claim.

TODO: Make the UI copy match the combined metric.
1. Gold standard: page text says the metric includes person salary records and role-level compensation.
2. Existing code: the card subtitle and source chart subtitle were the local pattern to adjust.
3. Online source check: not required.
4. Literature check: not required.

TODO: Bust stale client query cache after deployment.
1. Gold standard: update the React Query key for the changed data shape.
2. Existing code: `['data-stats', 'finance-v2']` was the local versioning pattern.
3. Online source check: not required.
4. Literature check: not required.

## Iteration 1

goal: Diagnose and patch the screenshot issue.
changes: Added `buildSalaryAnalytics`, switched the data stats hook to include latest office compensation, changed the query key to `finance-v3`, and updated data page salary labels.
commands: `npm test -- src/test/data-observatory.test.ts`
exit_codes: `0`
artifacts: `src/hooks/use-data-observatory.ts`, `src/pages/Data.tsx`, `src/test/data-observatory.test.ts`
observations: Focused test passed with 3 tests; new helper covers finance rows, office compensation rows, source fallback, and bucket totals.
decision: keep
risks: Initial numeric guard could allow `NaN` into salary records.
next_todo: Patch numeric validation.

## Critique Pass 1

Flaws:
- `NaN <= 0` is false, so malformed numeric values could enter aggregation.
- The first helper signature used broad `any` types.

Patch todo:
- Require `Number.isFinite(amount)` before inserting salary rows.
- Re-run focused test.

## Iteration 2

goal: Harden numeric filtering.
changes: Added finite-number guards for personal salary and office compensation amounts.
commands: `npm test -- src/test/data-observatory.test.ts`
exit_codes: `0`
artifacts: `src/hooks/use-data-observatory.ts`
observations: Focused test passed with 3 tests.
decision: keep
risks: Helper still introduced avoidable lint warnings through broad parameter types.
next_todo: Replace broad helper parameter types with narrow local row types.

## Critique Pass 2

Flaws:
- New helper parameter `any[]` created avoidable lint warnings.
- The patch should not make the repo's existing lint warning count worse.

Patch todo:
- Add narrow `FinanceSalaryRow` and `LatestOfficePaySalaryRow` helper input types.
- Re-run targeted test, typecheck, lint, full tests, and build.

## Iteration 3

goal: Verify production readiness after critique patches.
changes: Typed helper inputs and re-ran checks.
commands: `npm test -- src/test/data-observatory.test.ts`; `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`
exit_codes: `0`; `0`; `0`; `0`; `0`
artifacts: `dist/`, `src/hooks/use-data-observatory.ts`, `src/pages/Data.tsx`, `src/test/data-observatory.test.ts`
observations: Focused test passed 3 tests; typecheck passed; lint exited 0 with legacy warnings only; full test suite passed 83 files / 390 tests; Vite build succeeded and emitted `dist/assets/Data-Cg7qEVQq.js`.
decision: keep
risks: GitHub Pages will not show the new bundle until `main` is pushed and the Pages workflow completes.
next_todo: Commit branch changes, fast-forward `main`, push `main`, then verify deployed asset changes.

## Deployment Workflow TODO Triage

TODO: Prevent skipped PR workflow-run deploys from cancelling an in-progress main Pages deploy.
1. Gold standard: the successful main CI-triggered Pages deploy completes even if later PR CI workflow-run events evaluate the deploy job condition to skipped.
2. Existing code: `deploy-supabase.yml` already uses `cancel-in-progress: false`; `deploy-pages.yml` was the outlier with `true`.
3. Online source check: not required; this follows GitHub Actions' local concurrency configuration already used in the repository.
4. Literature check: not required.

## Deployment Iteration 1

goal: Diagnose why the pushed main commit was still not live.
changes: None.
commands: `curl -L -s https://poli-track-os.github.io/poli-track-os/data`; GitHub Actions REST polling for workflow runs.
exit_codes: `0`; `3`
artifacts: `https://github.com/poli-track-os/poli-track-os/actions/runs/25212489820`, `https://github.com/poli-track-os/poli-track-os/actions/runs/25212524038`
observations: CI for `04c1daf` completed successfully, but the first `Deploy Website` run was cancelled and subsequent deploy runs were skipped; the public page still served `/poli-track-os/assets/index-DJFGf8N3.js`.
decision: keep
risks: Static deploy concurrency with `cancel-in-progress: true` lets skipped workflow-run events cancel a valid main deploy.
next_todo: Patch Pages deploy concurrency to match the Supabase deploy workflow's non-cancelling queue behavior.

## Deployment Critique Pass 1

Flaws:
- Trigger filtering already exists in the job `if`, but it happens after workflow-level concurrency, so skipped runs can still cancel earlier valid runs.
- Manually re-running Pages would be a temporary workaround, not a durable fix.

Patch todo:
- Change only `deploy-pages.yml` from `cancel-in-progress: true` to `false`.
- Validate YAML syntax and whitespace.

## Deployment Iteration 2

goal: Patch deploy workflow cancellation behavior.
changes: Changed `deploy-pages.yml` concurrency to `cancel-in-progress: false`.
commands: `git diff --check -- .github/workflows/deploy-pages.yml .vddp/2026-05-01-data-salary-deployment.md`; `node -e "import('yaml')..."`
exit_codes: `0`; `0`
artifacts: `.github/workflows/deploy-pages.yml`
observations: Whitespace check passed; YAML parse passed with the local `yaml` package. Ruby was unavailable, so Node/YAML was used.
decision: keep
risks: Non-cancelling deploy queue can let an older Pages deploy finish before a newer queued one, but queued later successful deploys still run afterward; skipped runs exit quickly.
next_todo: Run second critique pass, then commit and push the workflow fix.

## Deployment Critique Pass 2

Flaws:
- Changing deployment concurrency is a workflow behavior change, so it must stay as narrow as possible.
- The Supabase deploy workflow already has the desired behavior, so touching it would add unnecessary risk.

Patch todo:
- Keep the change limited to `deploy-pages.yml`.
- After push, verify CI and Pages deploy status again and confirm the public asset hash changes.
