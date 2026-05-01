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
